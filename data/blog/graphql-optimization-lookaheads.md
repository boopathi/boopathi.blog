---
title: GraphQL Optimization - Lookaheads
date: '2020-02-09'
tags:
  - GraphQL
  - Optimization
  - JavaScript
draft: false
---

This post is the first part of a series about optimizations in a GraphQL server we made at [Zalando](https://www.zalando.de). This post requires a basic understanding of a GraphQL server - especially its resolvers.

Cross posted -

[Zalando Engineering Blog - Optimize GraphQL Server with Lookaheads](https://engineering.zalando.com/posts/2021/03/optimize-graphql-server-with-lookaheads.html)

Posts in the series -

> **[Part 1: Lookaheads (this post)](https://boopathi.blog/graphql-optimization-lookaheads/)**

> [Part 2: Field Filtering](https://boopathi.blog/graphql-optimization-field-filtering/)

> [Part 3: Dataloaders](https://boopathi.blog/graphql-optimization-dataloaders/)

> [Part 4: Lookaheads - Prefetching](https://boopathi.blog/graphql-optimization-lookaheads-prefetching/)

## Same Model; Different Views

In our GraphQL service, we do not have resolvers for every single field in the schema. Instead, we have certain groups of fields resolved together as a single request to a backend service that provides the data. For example, let's take a look at the `product` resolver,

```js
resolvers = {
  Query: {
    product(_, { id }) {
      return ProductBackend.getProduct(id)
    },
  },
}
```

This resolver will be responsible for getting multiple properties of the `Product` - name, price, stock, images, material, sizes, brand, color, other colors, and a lot of other details. The same **Product** type in schema is used to render a Product _Card_ in a grid as well as the entire Product _Page_ in the website. The amount of data required for a Product card is much less compared to the entire product details in a dedicated product page.

Everytime the product resolver is called, the entire response from the product backend is requested by the GraphQL service. Though GraphQL allows us to specify the data requirements to fetch optimally, it becomes benefitial only between the client-server communication. The data transfers between GraphQL server and the Backend server remain unoptimized.

## Partial Responses

Most of the backend services in Zalando support [Partial responses](https://cloud.google.com/blog/products/api-management/restful-api-design-can-your-api-give-developers-just-information-they-need) - i.e. in the request, one can specify the list of fields. Only these fields must be in the response trimming other fields which were not specified in the request. The backend service treats this like a filter and returns only those fields. It is similar to what GraphQL offers us and the request somewhat looks like this -

```http
GET /product?id=product-id&fields=name,stock,price
```

Here, the `fields` query parameter is used to declare the required response fields. The backend can use this to compute only those response fields. Likewise, the backend can pass it further down the pipeline to another service or database. The response for the above request would look like -

```json
{
  "name": "Fancy T-Shirt",
  "stock": "AVAILABLE",
  "price": "EUR 35.50"
}
```

Partial responses help in reducing the amount of data over the wire and give a good performance boost. A GraphQL query is also exactly the same thing - it provides a well-defined language for the `fields` parameter in the above request.

## Lookahead

![On the way to Chua Huong](https://images.unsplash.com/photo-1515921906220-71cf0d2c9366?w=1440&auto=format&lossless=true)

Photo by [Stéphane Vermeulin](https://unsplash.com/@svermeulin?utm_source=ghost&utm_medium=referral&utm_campaign=api-credit) / [Unsplash-](https://unsplash.com/?utm_source=ghost&utm_medium=referral&utm_campaign=api-credit)

Let's leverage these partial responses and use it in the GraphQL server. When resolving the product, we must know what the next fields are within this product, (or) we need to **look ahead** in the query to get the sub-fields of the product.

```gql
query {
  product(id: "foo") {
    name
    price
    stock
  }
}
```

Remember that - name, stock, and price do not have explicitly declared resolvers. When resolving `product`, how can we know what its sub-selections are? This is where navigating the query [AST (Abstract Syntax Tree)](https://en.wikipedia.org/wiki/Abstract_syntax_tree) helps. In your GraphQL execution engine, the resolver function will receive the AST of the current field in some form depending on the language and implementation. For [GraphQL-JS](Https://github.com/graphql/graphql-js), or [GraphQL-JIT](Https://github.com/zalando-incubator/graphql-jit) executors, it is available in the last parameter (of the resolver function) which is called a **Resolve Info**.

```js
resolvers = {
  Query: {
    product(_, { id }, context, info) {
      const fields = getFields(info)
      return ProductBackend.getProduct(id, fields)
    },
  },
}
```

We use the query AST in the resolve info to compute the list of fields under product, pass this list of fields to the product backend which supports partial responses, and then send the backend response as the resolved result.

## Field nodes

The resolve info is useful for doing a lot of optimizations. Here, for this case, we are interested in the **fieldNodes**. It is an array of objects each representing the _same_ field - in this case - `product`. Why is it an array? A single field may appear in more than one place in a query - for instance, fragments, inline fragments, aliasing, etc... For simplicity, we will not consider fragments and aliasing in this post. I'll leave that as an exercise for the reader or later cover in a separate post.

The entire query can be thought of as a tree of field nodes where the children at each level are available as selection sets.

Each fieldNode has a **Selection Set** which is a list of **sub field nodes** - here - the selection set will be the field nodes of _name_, _stock_ and _price_. So the `getFields` implementation (without considering fragments and aliasing) will look like -

```js
function getFields(info) {
  return info.fieldNodes[0].selectionSet.selections // TODO: handle all field nodes in other fragments
    .map(
      (selection) =>
        // TODO: handle fragments
        selection.name.value
    )
}
```

When we pass product resolver's `info`, the `getFields` function returns - `[name, stock, price]`. We can take this list and pass it to the backend as the query parameter.

For simple use-cases like these, where the backend data structure and the GraphQL schema are the same, it's easy to directly send graphql fields as the backend fields. When it's a bit different, we need to map the schema fields to backend fields for the request. Also, we need to map the backend fields back to schema fields for the response. I'll write about handling such complications in the next coming posts.

## Conclusion

Whenever the backend supports Partial response, we observed that it was always beneficial to compute the required fields in the query using lookaheads and this acted as a performance boost for the GraphQL server.

1. Amount of data transfer between backend and GraphQL server drastically reduced improving response read times.
1. JSON parsing times in the GraphQL server reduced. Parsing JSON is one of the biggest CPU intensive **synchronous** operation that cannot be optimized further in NodeJS. By doing less of JSON parsing, our CPU is less loaded doing synchronous things - this improved response times and also throughput.

## Next Post in the series

[GraphQL Optimization - Field Filtering](https://boopathi.blog/graphql-optimization-field-filtering/)
