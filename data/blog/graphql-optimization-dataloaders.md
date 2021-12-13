---
title: GraphQL Optimization - Dataloaders
date: '2020-02-19'
tags:
  - GraphQL
  - Optimization
  - JavaScript
draft: false
summary: In the previous posts, we saw how to optimize the data transfer between the GraphQL server and a data provider - backend server. In this post, I'm going to talk about how we can handle the complexities we discussed in previous posts with a Dataloader
---

This post is part of a series of posts about optimizations in GraphQL servers. This post requires a basic understanding of GraphQL. If you've not read my previous posts in this series, please read Part [1](https://boopathi.blog/graphql-optimization-lookaheads/) and [2](https://boopathi.blog/graphql-optimization-field-filtering/) before continuing.

Cross posted -

[Zalando Engineering Blog - Optimize GraphQL Server with Lookaheads](https://engineering.zalando.com/posts/2021/03/optimize-graphql-server-with-lookaheads.html)

> [Part 1: Lookaheads](https://boopathi.blog/graphql-optimization-lookaheads/)

> [Part 2: Field Filtering](https://boopathi.blog/graphql-optimization-field-filtering/)

> **[Part 3: Dataloaders (this post)](https://boopathi.blog/graphql-optimization-dataloaders/)**

> [Part 4: Lookaheads - Prefetching](https://boopathi.blog/graphql-optimization-lookaheads-prefetching/)

In the previous posts, we saw how to optimize the data transfer between the GraphQL server and a data provider - backend server. We handled some complexities where the data structure of the GraphQL schema does not match 1-1 with that of the backend server.

In this post, I'm going to talk about how we can handle the complexities we discussed so far in a [Dataloader](https://github.com/graphql/dataloader).

In a gist from the previous posts, we have the following -

1. `getFields`: compute sub-fields by looking ahead in AST
1. `getBackendFields`: compute backend fields from sub-fields and dependency map
1. `partial response`: make a request to the backend to get the fields filtered partial response
1. `getSchemaResponse`: compute schema fields from partial backend response, sub-fields computed in the first step, and the transformer map

## Batching

At [Zalando](https://www.zalando.de), like [partial responses](https://cloud.google.com/blog/products/api-management/restful-api-design-can-your-api-give-developers-just-information-they-need), most of our backends support batching multiple requests into a single request. Instead of get resource by `id`, most of the backends have get resource by `ids`. For example,

```http
GET /products?ids=a,b,c&fields=name
```

will return a response

```json
[{ "name": "a" }, { "name": "b" }, { "name": "c" }]
```

We should take advantage of such features. One of the popular libraries that aid us in batching is the [DataLoader](https://github.com/graphql/dataloader) by Facebook.

We provide the dataloader an implementation for handling an array of inputs that returns an array of outputs / responses in the same order. The dataloader takes care of combining and batching requests from multiple places in the code in an optimal fashion. You can read more about it in the Dataloader's documentation.

[graphql/dataloader](https://github.com/graphql/dataloader)

## Dataloader for product resolver

When a Product appears in multiple parts of the same GraphQL query, each of those will create separate requests to the backend. For example, let's consider this simple GraphQL query -

```graphql
query {
  foo: product(id: "foo") {
    ...productCardFields
  }
  bar: product(id: "bar") {
    ...productCardFields
  }
}
```

The products _foo_ and _bar_ are batched together into a single query using [aliasing](https://graphql.org/learn/queries/#aliases). If we implement a resolver for product that calls the _ProductBackend_, we will end with **two** separate requests. Our goal is to make it in a single request. We can implement this with a dataloader -

```js
async function getProductsByIds(ids) {
  const products = await fetch(`/products?ids=${ids.join(',')}`)
  return products
}

const productLoader = new Dataloader(getProductsByIds)
```

We can use this `productLoader` in our product resolver -

```js
resolvers.Query.product = async (_, { id }) => {
  const product = await productLoader.load(id)
  return product
}
```

The Dataloader takes care of the magic of combining multiple calls to the `load` method into a single call to our implementation - `getProductsByIds`.

## Complexities

The DataLoader dedupes inputs, optionally caches the outputs, and also provides a way to customize these functionalities. In the `productLoader` defined above, our input is the product **id** - a **string**. When we introduce the concepts of [partial responses](https://cloud.google.com/blog/products/api-management/restful-api-design-can-your-api-give-developers-just-information-they-need), the backend expects more than just the _id_ - it also expects the _fields_ parameter that is used to select the fields for the response. So our input to the loader is not just a string - let's say, it's an object with keys - _"ids"_ and _"fields"_. The dataloader implementation now becomes -

```js
async function getProductsByIds(inputs) {
  const ids = inputs.map((input) => input.id)
  //
  // We have a problem here
  //                    v
  const fields = inputs[0].fields
  const products = await fetch(`/products?ids=${ids.join(',')}&fields=${fields}`)
  return products
}
```

Here, in the above code-block, I've highlighted a problem - each of the `productLoader.load` call can have different set of fields. What is our strategy for merging all of these fields together? Why do we need to merge?

Let's go back to an example and understand why we should handle this -

```graphql
query {
  foo: product(id: "foo") {
    name
  }
  bar: product(id: "bar") {
    price
  }
}
```

The product foo requires _name_ and product bar requires _price_. If we remind ourselves how this gets translated to backend fields using the dependency map, we end up with the following calls -

```js
productLoader.load({
  id: 'foo',
  fields: ['name'],
})

productLoader.load({
  id: 'bar',
  fields: ['price.currency', 'price.amount'],
})
```

If these two calls get into a single batch, we need to merge the fields such that both of them work during transformation of backend fields to schema fields. Unfortunately, in most cases, it's not possible to select different fields for different ids in the backend. If this is possible in your case, you probably do not need merging. But for my use-case and probably many others, let's continue the topic assuming merging is necessary.

## Merging fields

In the above example, the correct request to the backend would be -

```http
GET /products
    ? ids = foo , bar
    & fields = name,
               price.currency,
               price.amount
```

The merge strategy is actually quite simple, it's a union of all the fields. Structurally we need the following transformation -  
`[ { id, fields } ]` to `{ ids, mergedFields }`. The following implementation merges the inputs -

```js
function mergeInputs(inputs) {
  const ids = []
  const fields = new Set()
  for (const input of inputs) {
    ids.push(input.ids)
    for (const field of input.fields) {
      fields.add(field)
    }
  }

  return {
    ids,
    mergedFields: [...fields].join(','),
  }
}
```

## The resolver

Combining all the little things we handled so far, the resolver for our product will now look like this -

```js
resolvers.Query.product = async (_, { id }, __, info) => {
  const fields = getFields(info)
  const backendFields = getBackendFields(fields, dependencyMap)
  const backendProduct = await productLoader.load({
    id,
    fields: backendFields,
  })
  const schemaProduct = getSchemaResponse(backendProduct, fields, transformerMap)
  return schemaProduct
}
```

The concept we have so far is -

1. `getFields`: compute sub-fields by looking ahead in AST
1. `getBackendFields`: compute list of backend fields from sub-fields and dependency map
1. `productLoader.load({ id, backendFields })`: use the product loader to schedule in the dataloader to fetch a product.
1. `mergeFields`: merge the different inputs to dataloader into list of ids and union of all backendFields from all inputs.
1. Send the batched input as request to the backend and get the partial response
1. `getSchemaResponse`: compute schema fields from partial backend response, sub-fields computed in the first step, and the transformer map

Putting it all together, here is the complete code using all of the optimizations we have discussed so far - _lookaheads_, _field filtering_, and _dataloaders_ -

[graphql-optimization-dataloaders.js](https://gist.github.com/boopathi/2a96def5deecf7db4077594287de5e38#file-graphql-optimization-dataloaders-js) hosted with ❤ by [GitHub](https://github.com)

## Conclusion

All of the code, patterns and nuances we have seen until now may differ for different applications or different languages. The important point is to understand the problem statement, the complexities involved, and the concepts behind the optimizations. I hope these posts helped you discover ideas on how to optimize your GraphQL server.

By doing these things that look like a lot of extra work, you have to consider the trade off whether such optimizations work for every backend. As the GraphQL schema grows, these solutions scale well. At Zalando's scale, it has proved to be better than the transfer of unoptimized huge blob of data.

In next posts, let's have an overlook at a few other optimization techniques for GraphQL servers we implemented at Zalando.

If you like to know about these topics in more detail, feel free to write to me on twitter - [@heisenbugger](https://twitter.com/heisenbugger).

## Next post in the series

[GraphQL Optimization - Lookaheads - Prefetching](https://boopathi.blog/graphql-optimization-lookaheads-prefetching/)
