---
title: GraphQL Optimization - Field Filtering
date: '2020-02-18'
tags:
  - GraphQL
  - Optimization
  - JavaScript
draft: false
---

This is the part-2 of a series of posts about optimizations in GraphQL. This post requires a basic understanding of [GraphQL](https://graphql.org). If you've not read my previous post, please read [Part 1: Lookaheads](https://boopathi.blog/graphql-optimization-lookaheads/) before continuing.

Cross posted -

[Zalando Engineering Blog - Optimize GraphQL Server with Lookaheads](https://engineering.zalando.com/posts/2021/03/optimize-graphql-server-with-lookaheads.html)

> [Part 1: Lookaheads](https://boopathi.blog/graphql-optimization-lookaheads/)

> **[Part 2: Field Filtering (this post)](https://boopathi.blog/graphql-optimization-field-filtering/)**

> [Part 3: Dataloaders](https://boopathi.blog/graphql-optimization-dataloaders/)

> [Part 4: Lookaheads - Prefetching](https://boopathi.blog/graphql-optimization-lookaheads-prefetching/)

In the previous post (linked above), we saw how we can take advantage of lookaheads using the [AST(Abstract Syntax Tree)](https://en.wikipedia.org/wiki/Abstract_syntax_tree) in the resolver. We also discussed briefly that there can be complications when the schema fields do not match exactly with the backend fields. In this post, we are going to look at how we can model these complications.

## Scribble, draw, and elucidate

The first step is to understand what we have. Let's do that with the same example we used in the previous post. In the GraphQL schema, we have the type **Product** with a lot of fields and a query that asks for 3 things - _name_, _price_, and _stock_. If the backend fields are exactly the same, then our resolver would simply return the backend response as is -

```js
    resolvers.Query.product = (_, { id }, __, info) {
      // getFields is discussed in part-1: lookaheads
      const fields = getFields(info);
      return ProductBackend.get(id, fields)
    }
```

If the backend fields are different, then there exists a mapping from schema fields to backend fields. A simple mapping may be the difference in the name of the fields. For example _name_ in schema might be _title_ in the backend. This mapping can get complex where a single schema field might be derived from multiple backend fields - for example, _price_ in schema might be concatenation of _currency_ and _amount_ from the backend. It gets interesting when we have nested structures - for example, price in schema might be concatenation of _price.currency_ and _price.amout_.

### Don't forget that the response is partial

Another aspect of this mapping is that it's not enough to think about it one way - from schema fields to backend fields. This only suffices the request from graphql server to the backend server. The response that the backend sends needs to be transformed to match the schema and it doesn't come for free when we have such complications in the mapping of fields.

When we have a single transform function that converts backend response to match the schema, we have to understand that it is built from a [partial response](https://cloud.google.com/blog/products/api-management/restful-api-design-can-your-api-give-developers-just-information-they-need) and not complete response -

```js
function backendProductToSchemaProduct(backendProduct) {
  return {
    name: backendProduct.title,
    // we have a problem here -
    price: `${backendProduct.currency} ${backendProduct.amount}`,
    stock: backendProduct.stock_availability,
  }
}
```

In the above implementation, when the query is `{ product(id) { name } }`, the transformer will try to convert assuming the entire response is available. Since the backend responded with partial data (only the _name_ field is used), the access to a nested property will throw an error - `Cannot read property currency of 'undefined'`. We could have a null check at every place, but the code becomes not so maintainable. So we need a way to model it both ways -

1. Map schema fields to backend fields during the request to backend
1. Map backend fields to schema fields with the response from backend

## Dependency Maps

The mapping we talked about in our scribbling phase is what a dependency map is. Every schema field depends on one or many nested fields in the backend. A way to represent this can be as simple as an object whose keys are schema fields and the values are a list of [object paths](https://github.com/mariocasciaro/object-path#usage).

```js
const dependencyMap = {
  name: ['title'],
  price: ['price.currency', 'price.amount'],
  stock: ['stock_availability'],
}
```

From this dependency map, we can create our request to the backend. Let's say, the backend takes a query parameter _"fields"_ in the the following form - a comma separate list of object path strings. Depending on the implementation, there can a wide variety of formats for this. Here, we will take a simple one.

```js
function getBackendFields(schemaFields, dependencyMap) {
  // Set helps in deduping
  const backendFields = new Set(
    schemaFields.map((field) => dependencyMap[field]).reduce((acc, field) => [...acc, ...field], [])
  )
  return backendFields.join(',')
}
```

For schema fields name, and price, the computed backend fields would be a string and we can construct the request to backend -

```http
GET /product?id=foo&fields=title,price.currency,price.amount
```

## Transformation Maps

After the request, we know that the backend returns a partial response instead of the whole response. We also saw above that a single function that transforms the entire backend response to schema fields is not enough. This is where a **transformation map** comes in. It's a map of schema fields to transformation logic. Like the dependency map, the keys are schema fields, but the values are transform functions that uses only certain fields from the backend.

```js
const transformerMap = {
  name: (resp) => resp.title,
  price: (resp) => `${resp.currency} ${resp.amount}`,
  stock: (resp) => resp.stock_availability,
}
```

As you see here, each value is a function where the only properties used inside this function are the ones we defined in the **dependency map**. To construct the result object from the partial response of the backend, we simply use the same computed sub-fields (from the `getFields` function) and use it on the transformer map. For example -

```js
function getSchemaResponse(backendResponse, transformerMap, schemaFields) {
  const schemaResponse = {}
  for (const field of schemaFields) {
    schemaResponse[field] = transformerMap[field](backendResponse)
  }
  return schemaResponse
}
```

## Putting it all together

Let's recap on how the concept we have so far unwraps -

1. `getFields`: compute sub-fields by looking ahead in AST
1. `getBackendFields`: compute backend fields from sub-fields and dependency map
1. make request to backend with the computed backend fields
1. `getSchemaResponse`: compute schema response from partial backend response, sub-fields and the transformer map

The complete code —

[graphql-optimization-field-filtering.js](https://gist.github.com/boopathi/364cc2a6156b0f69b644be687f1280ee#file-graphql-optimization-field-filtering-js) hosted with ❤ by [GitHub](https://github.com)

## Conclusion

Field filtering using Dependency Maps and Transformer Maps enables us to handle complexities in optimizing GraphQL servers for performance. Though this looks like a lot of work, at runtime this out performs the otherwise unoptimized handling of huge responses from the backend - JSON parsing cost + transfer of bytes + construction time of the response by the backend.

In next posts, we will handle more complexities and look at how to conceptualize these things so that we are able to derive solutions that fit our data structures and models.

## Next post in the series

[GraphQL Optimization - Dataloaders](https://boopathi.blog/graphql-optimization-dataloaders/)
