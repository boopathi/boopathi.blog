---
title: GraphQL directives - an introduction
date: '2022-02-02'
tags:
  - GraphQL
draft: false
summary: >-
  This post gives an introduction to GraphQL directives, how to create custom
  ones, explains the different locations where directives can be used, and goes
  over some use-cases of directives.
images:
  - /static/blog/graphql-directives-an-introduction/twitter-card.png
---

In GraphQL, if you've used the syntax that starts with `@`, for example, `@foo`, then you've used GraphQL directives. This post is about creating custom directives and exploring some use-cases of these custom directives.

## Overview

<TOCInline toc={props.toc} exclude="Overview" toHeading={4}/>

## What are directives in GraphQL?

Directives as a language feature are not well-defined in terms of functionality but defined only in terms of syntax.

It provides us a way to extend the language features of GraphQL using a supported syntax. Directives are useful when the existing language features will not suffice. For example, a field in GraphQL has a certain execution characteristics. When the handler for the field -- the field's `resolver` is called is well-defined. We can also have one or more arguments for the field. If these arguments do not suffice, and we need to append something more to the execution pipeline, directives are a useful tool.

Directives in schema act as a great way to express rules, constraints, and metadata in a declarative manner.

You might have used directives in GraphQL -- for example, `@skip`, `@include`, `@deprecated`, and `@specifiedBy`. These are in-built directives that must be supported by all GraphQL engines. Each has its own function and are all used in GraphQL queries and schemas. The `skip` and `include` directives belong to the query, while the `deprecated` and `specifiedBy` belong in the schema. What makes these differences, and how can we define our custom directives and extend the functionality of the GraphQL language for our servers?

## Declaring directives

If you're using [GraphQL SDL (Schema Definition Language)][sdl] to define schema, a directive declaration would look like this -

```graphql
directive @foo($arg: String!) on QUERY | MUTATION
```

If you're not using the schema language, you can declare a directive using the `GraphQLDirective` constructor -

```ts
import { GraphQLDirective, DirectiveLocation } from 'graphql'

const fooDirective = new GraphQLDirective({
  name: 'foo',
  args: {
    arg: { type: GraphQLString },
  },
  locations: [DirectiveLocation.QUERY, DirectiveLocation.MUTATION],
})
```

The declaration contains three parts that we can control.

1. The name of the directive. In the above example, it is `@foo`
1. The arguments of the directive and their types. In the above example, `arg`.
1. The places where the directive can be used. In the above example, `QUERY | MUTATION`

## Directive Locations

The possible values of where a directive can be defined is available in the GraphQL specification -- [`DirectiveLocations`][directive_locations]. As you can see in the specification, a directive can be defined for one of the two categories of locations -- **Executable** and **TypeSystem**.

The location names in the **Executable** form are the query directives that the client can use. For example,

```graphql
# In the server schema definitions,
directive @auth(token: String!) on QUERY | MUTATION

# and in the client,
query ($token: String!) @auth(token: $token) {
  ...queryFields
}
```

The location names in the **TypeSystem** form are the schema directives that the schema can use. But, what use does a schema directive have? To answer this question let's start with a problem statement for our GraphQL servers.

## `Executable` directives locations

These are directives that are used in the query. For example, the in-built directives (at the time of this writing) such as `@skip`, `@include`, `@stream`, `@defer` are all executable directives.

The executable directives are available for the locations listed below. Consider `@foo` to be directive defined for the location mentioned in the 1st column.

```graphql
directive @foo on LOCATION_IN_FIRST_COLUMN
```

| Directive Location  | Example                        |
| :------------------ | :----------------------------- |
| QUERY               | `query name @foo {}`           |
| MUTATION            | `mutation name @foo {}`        |
| SUBSCRIPTION        | `subscription name @foo {}`    |
| FIELD               | `query { product @foo {} }`    |
| FRAGMENT_DEFINITION | `fragment x on Query @foo { }` |
| FRAGMENT_SPREAD     | `query { ...x @foo }`          |
| INLINE_FRAGMENT     | `query { ... @foo { } }`       |
| VARIABLE_DEFINITION | `query ($id: ID @foo) { }`     |

## `TypeSystem` directives locations

These are locations where the directives will be used in the schema. The existing in-built TypeSystem directives in GraphQL are `@deprecated`, and `@specifiedBy`.

The type system directives are available for the below listed locations. Consider `@foo` to be the directive declared for the possible locations.

```graphql
directive @foo on LOCATION_IN_FIRST_COLUMN
```

| Directive Location     | Example                                   |
| ---------------------- | ----------------------------------------- |
| SCHEMA                 | `schema @foo { query: Query }`            |
| SCALAR                 | `scalar x @foo`                           |
| OBJECT                 | `type Product @foo { }`                   |
| FIELD_DEFINITION       | `type X { field: String @foo }`           |
| ARGUMENT_DEFINITION    | `type X { field(arg: Int @foo): String }` |
| INTERFACE              | `interface X @foo {} `                    |
| UNION                  | `union X @foo = A \| B`                   |
| ENUM                   | `enum X @foo { A B }`                     |
| ENUM_VALUE             | `enum X { A @foo B }`                     |
| INPUT_OBJECT           | `input X @foo { }`                        |
| INPUT_FIELD_DEFINITION | `input X { field: String @foo }`          |

---

Below are some incomplete list of use-cases of GraphQL directives.

## Metadata

Let's consider the following case. You use persisted queries in your GraphQL server. Many teams build and persist these queries. Many versions of apps use different queries. And also, the queries could also be used in different platforms -- like web, iOS, or android. You want to be able to associate failures to page the right team who built the query. You want to draw metrics specific to an app version or platform. All this meta can go into query directives while the author is writing persisting the query.

As an example,

```graphql
mutation addToCart($id: ID!)
@team(name: "cart")
@platform(name: IOS)
@appVersion(version: "5.15.2")
@sli(name: "add-to-cart") {
  addToCart(id: $id)
}
```

## Validation rules

Schema directives on input definitions are useful to specify custom constraints on the input. As examples,

### `@maxLength`

```graphql
type Query {
  hasTooManyCharacters(str: String! @maxLength(value: 64)): Boolean
}
```

### `@conformsRegex`

```graphql
type Foo {
  hasSpecialCharacter(str: String! @conformsRegex(regex: "[a-zA-Z]+")): Boolean
}
```

### `@validate`, `@minLength`

```graphql
type Mutation {
  createAccount(
    email: String! @validate(format: EMAIL)
    password: String! @validate(format: PASSWORD)
    name: String! @minLength(value: 1)
  ): CreateAccountPayload
}
```

There can be many more use-cases of custom directives for input validation depending on your business domain. The advantage of using directives here to specify these validation rules is that these are declarative. One does not need a separate document to check what the validation of each field is. The specification of these validation rules goes 1-1 with how we express it with these directives, which is a very nice property to have in our models.

## Auth

### `@auth`

Though auth must be done in the request layer and not GraphQL layer, it could be a useful tool for a GraphQL server that allows only one query document per request.

```graphql
query foo($token: String!) @auth(token: $token) {
  user {
    name
  }
}
```

### `@isAuthenticated`

When we have a unified schema that covers the entire website or web app or app, certain parts of the schema might be public data and certain other parts might be user's data. To express which parts are private data and require customer authentication, directives provide a great way to express this in declaration.

```graphql
type Query {
  user: User @isAuthenticated
}
```

If you have multiple levels of auth, you can simply specify that using the directive's parameter.

```graphql
type Query {
  user: User @isAuthenticated(level: USER)

  allUsers(first: Int, after: String): [User!] @isAuthenticated(level: ADMIN)
}
```

## Marking sensitive data

Marking certain data as sensitive so that it doesn't end up in our monitoring platforms is an important responsibility of a server. Directives are a great way to declare such fields.

I've written a dedicated blog post for this topic. It covers the `@sensitive` directive. You can read it here -- [How to avoid logging sensitive data in GraphQL?](./how-to-avoid-logging-sensitive-data-in-graphql)

## Stages of experimentation

It's always exciting to try out new product features. But which parts of the GraphQL schema are stable and which parts are still for experimentation. To solve this problem, directives are very helpful.

I have a dedicated blog post about stages of stability for various fields of the schema. It discusses 3 directives -- `@draft`, `@component`, and `@allowedFor`, and how they work along with the concept of persisted queries.

You can read it here -- [GraphQL persisted queries and schema stability](./graphql-persisted-queries-and-schema-stability).

## Conclusion

There are many other use-cases of directives that I've not covered. I hope this post gave you a good introduction to GraphQL directives and when to use them. For cases that can simply be solved with a field argument, directives are an over-kill, and makes your schema and execution pipeline unnecessarily complex. So it's good to understand where the directives are really useful and where the existing simplicity of GraphQL is beneficial.

As always, if you have any doubts or comments or questions or fixes for this post, please feel free to tweet to me at [@heisenbugger](https://twitter.com/heisenbugger).

[sdl]: https://graphql.org/learn/schema/
[directive_locations]: https://spec.graphql.org/October2021/#DirectiveLocations
