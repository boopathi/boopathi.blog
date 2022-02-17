---
title: GraphQL persisted queries and schema stability
date: '2020-06-14'
tags:
  - GraphQL
  - Design
draft: false
summary: >-
  In this post, I cover the topics — GraphQL persisted queries at Zalando and
  how we define and think about different levels of stability of our GraphQL
  schema.
images:
  - /static/blog/graphql-persisted-queries-and-schema-stability/twitter-card.png
---

Welcome to yet another post about GraphQL. In this post, I cover the topics — GraphQL persisted queries at Zalando and how we define and think about different levels of stability of our GraphQL schema.

Cross posted - https://engineering.zalando.com/posts/2022/02/graphql-persisted-queries-and-schema-stability.html

## Persisted Queries

Persisted Queries in GraphQL are like stored procedures in Databases. If you want to know about the Apollo's way of automated persisted queries, please follow their [documentation here](https://www.apollographql.com/docs/apollo-server/performance/apq/). At Zalando, we took a different approach - **to disable GraphQL in production**. It might sound counter intuitive at first — we have a GraphQL service but we disable GraphQL in production — why?

Let us go over how the system works and explain the reasons for how it helps us maintain a stable schema —

### Part 1: Build time persistence

At development time, for the web and apps, the developers enjoy the power of GraphQL — the automatic code and type generation, combining multiple parts of the application to send queries and aggregation of those queries to perform one optimized batched request, etc...

When the code in the UI layers (web and app) is actually merged to the main deployment branch, at the build time, there is one extra step - persist the queries to the GraphQL service. The GraphQL service generates an ID for a particular query (ID is just the hash of the normalized query in terms of formatting and operation selection), and returns it back to the UI layers to bundle with the actual built files.

When the actual query is used in production, the GraphQL service does not allow GraphQL queries, but rather only allows the query IDs that are persisted. So, instead of the request looking like this —

```http
POST /graphql

{
  "query": "query productCard($id: ID!) { product(id: $id) { name } }",
  "variables": {
    "id": "12345"
  }
}
```

it would look like this — with `id` instead of `query` —

```http
POST /graphql

{
  "id": "a1b2c3",
  "variables": {
    "id": "12345"
  }
}
```

### Part 2: Inspecting the persisted queries database

Now that we have a database of queries, we can perform certain inspections on these persisted queries. Because we do not allow non-persisted queries in production, we can know at any time — what parts of the schema are used in production and what are not used in production.

We leverage these persisted queries to have better monitoring and alerting for each individual query separately. We are also able to tell if certain fields can have a breaking change because the field is no longer used or never used in production.

## Schema Stability

As mentioned previously, our GraphQL schema covers wide variety of use-cases and different parts of the schema can have different levels of stability as new product features get added in.

All API's dream is to have a non-breaking model that evolves well. In most cases, it becomes impossible to design everything up front so well in a changing product landscape. In other aspects, the amount of time we spend meditating about certain models to get the best design possible may not warrant the actual time available to completely implement it end-to-end.

The schema is a collaboration of the UI engineers and the GraphQL server maintainers. It should be possible for the UI engineers to prototype something fast and break it later. But once the schema is merged to the main deployment branch, the GraphQL server maintainers do not wish to have breaking changes. How do we solve this conflict in a neat way?

Let's use branch deployments to satisfy this constraint, so the main branch stays clean. Though it looks simple and easy enough to understand, the mixing of branches across various projects soon becomes a nightmare in reality. At Zalando we have microservices and the GraphQL layer is an aggregator from multiple other services. So, maintaining multiple feature branches across 3-5 projects for 1 or 2 product features isn't going to help any developer or team move smoothly. The complexity increases non-linearly as we mix different features that must work together.

### Draft status

In the previous topic, we learnt about the power of persisted queries controlled by the GraphQL layer — we exactly know what part of the schema is used in production. So, our solution to schema stability starts by leveraging how we handle persisted queries — by marking certain parts of the schema as **not ready for production**, and preventing them to get into the persisted queries database.

For this we use [GraphQL directives](https://graphql.org/learn/queries/#directives) —

```graphql
directive @draft on FIELD_DEFINITION
```

The above directive will help annotate certain fields in the schema as draft. And during the persistence time, we validate if the query contains a field which is marked as such and disallow persisting it.

```js
export function draftRule(context) {
  return {
    Field(node) {
      const parentType = context.getParentType()
      const field = parentType.getFields()[node.name.value]
      const isDraft = field.astNode.directives.some((directive) => directive.name.value === 'draft')
      if (isDraft) {
        context.reportError(new GraphQLError(`Cannot persist draft field`))
      }
    },
  }
}
```

This is an example implementation of the rule which you can pass to the [GraphQL validation](https://graphql.org/learn/validation/). The usage in the schema would look like —

```graphql
type Product {
  fancyNewField: FancyNewType @draft
}

type FancyNewType {
  testField: String
}
```

In the above definition of a Product, when we add the new field `fancyNewField`, we begin by adding a draft status. When someone tries to persist it, it would fail.

This brings us new opportunities and guarantees —

1.  The field cannot be used in production
2.  We can break it at will, since we allow ONLY persisted queries in production
3.  We can merge it to the main branch (and even deploy it).

The draft status and how our persisted queries work improves the work flow. We are able to develop faster multiple features, experiment with it across different codebases, and still have the safety of production usage only after we stabilized (removing draft) the schema by testing it end-to-end.

### Experimenting in Production

The draft status allows us to deny persisting certain queries which we know are not ready for production usage. When they are ready, we want to carry forward certain experiments to production. But, we can still be unsure about the stability of this schema. This is tricky, but is a valid use-case often. Certain product features go into production as an experiment and then it may change form or structure by a little bit.

One obvious option is to remove the draft. But we do not restrict who can persist it. For example, some other parts of the UI may start persisting those experimental fields and we might not notice it until we inspect the queries. We certainly cannot break the schema once it is in production. So, how do we ensure that this experimental field is used only by the components that are part of the experiment?

Here, we introduce two new directives which act as access control for fields in production. The `@component` directive, and `@allowedFor` directive —

```graphql
directive @component(name: String!) on QUERY
directive @allowedFor(componentNames: [String!]!) on FIELD_DEFINITION
```

These two directives complement each other where one is used in the query and the other is used in the schema (here, on Field definition). We ask the queries authors to tag their queries using a component name and we match those names in the other directive `allowedFor` during persist time.

**Note:** Instead of component name, you can also use the operation name of the query itself.

For example,

```graphql
type Product {
  fancyProp: String @allowedFor(componentNames: ["web-product-card"])
}
```

and a query product card —

```graphql
query productCard @component(name: "web-product-card") {
  product {
    fancyProp
  }
}
```

would be allowed and any other query which uses the field `fancyProp` would fail to persist.

The component and allowed-for directives / annotations allow us to take an experimental feature to production by restricting the usage to one component of the UI. This allows us to handle breaking changes more easily as we have a guarantee that only that part of the UI needs to update when we have a minor breaking change.

## Conclusion

When we first implement something new, we start with the `draft` annotation. Then we promote that field to a restricted usage in production using the `allowedFor` annotation. After we finally have stabilized the schema, we remove all of these annotations and have a non-breaking contract.

This is just the starting point of the exploration to saving developer time as well as ensuring stability to the GraphQL schema. It helps us in evolving the schema rather than having to re-model it every single time.

I left out some of the nuances and implementation details which you can figure out when you're implementing it. Depending on the how you want to evolve the schema, and how you prefer to handle breaking changes, you can use these concepts and save precious time - by thinking about schema evolution in a non-destructive manner.

If you have any comments, corrections, doubts or questions about this post, feel free to contact me on twitter - [@heisenbugger](https://twitter.com/heisenbugger).
