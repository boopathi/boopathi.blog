---
title: How to avoid logging sensitive data in GraphQL
date: '2022-01-27'
tags:
  - GraphQL
  - Optimization
  - JavaScript
draft: true
summary: asdf
---

In this blog, we dive deep into tooling and optimizations for GraphQL servers. GraphQL is a great language for writing data requirements. In GraphQL, the syntax that looks like `@foo` is called a _directive_. You might have used directives in GraphQL queries -- for example, `@skip`, `@include`, `@stream`, and `@defer`. Did you know you can also create your own directives and use them in your schema definitions?

## Declaring directives

If you're using [GraphQL SDL (Schema Definition Language)][sdl] to define schema, a directive declaration would look like this -

```graphql
directive @foo($arg: String!) on QUERY | MUTATION
```

The declaration contains three parts that we can control.

1. The name of the directive. In the above example, it is `@foo`
1. The arguments of the directive and their types. In the above example, `arg`.
1. The places where the directive can be used. In the above example, `QUERY | MUTATION`

### Directive Locations

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

## Logging and Tracing

Metrics collection, Logging, and Tracing are some primary forms of monitoring we implement in all services. In the logs, traces, or metrics, we want enough information to understand failures so that we are able to fix the bugs that caused those failures.

Many of the times, the GraphQL server logs input variables so that enough information is available to debug the issue. Note -- whenever I mention logs, tracing, and metrics collection are also relevant. For simplicity, I'll stick to using 'logs' for simplicity.

Suppose we use a JSON based logger, and we log input variables in the query. The query and the log line might look like this --

```graphql
query ($id: ID!) {
  product(id: $id) {
    name
  }
}
```

The log line in JSON would be --

```json
{
  "timeStamp": "2022-01-23 12:34",
  "variablesId": "1234"
}
```

## Sensitive data

Logging the product ID seems innocuous. But, let's take another query that includes some sensitive information in the variables.

```graphql
query ($token: String!) @auth(token: $token) {
  ...fields
}
```

Here, we would have logged the `token` variable. Now, this is unsafe. Furthermore, image you handle user data in your GraphQL -- like

1. Creating an account
1. Updating password
1. Adding bank details
1. Add / update user's address data
1. etc.

```graphql
mutation ($email: String!, $password: String!) {
  createAccount(email: $email, password: $password) {
    account {
      id
    }
  }
}
```

Now, we would have logged-

```json
{
  "timestamp": "2022-01-24 11:34",
  "variablesEmail": "foo@example.com",
  "variablesPassword": "Password$123"
}
```

A log containing user's sensitive information is never safe, it must fail the software audit, and must also never be in production. How do we avoid this?

## Identifying sensitive data

One of the first steps in preventing such leaks is to identify them. Based on the business, different input or output fields in an API might classify as sensitive. As examples,

1. e-mail address, customer information like customer ID, IP address, or any other information that can be classified as personally identifiable data.
1. Health data
1. Financial data -- bank account, credit card numbers
1. passwords, tokens

Secondly, the parts of the system that use the sensitive data fields must be kept as minimal as possible. Isolating these data access in separate sections of the codebase will also be helpful in audits and reviews.

## Proactive measures

Acting before we identify a data leak of logging sensitive data is important in our server setup. Let's use the power of GraphQL to take these proactive measures. In the first section of the post, we discussed GraphQL directives. How can we leverage GraphQL directives to prevent sensitive data from ending up in our logs?

We can either let the user mark certain input arguments in the GraphQL query to be sensitive. But we cannot always rely on the user to make this decision. So we have to annotate our server -- i.e., in the schema directly. We end up with the following directive

```graphql
directive @sensitive(
  "An optional reason why the field is marked as sensitive"
  reason: String
) on ARGUMENT_DEFINITION
```

We name the directive `@sensitive` with an optional argument 'reason' to explain why the argument is sensitive. In the schema, the usage of the directive looks like this --

```graphql
type Mutation {
  createAccount(
    email: String! @sensitive(reason: "personally identifiable data")
    password: String! @sensitive(reason: "password")
  ): CreateAccountResult
}
```

After defining this new directive, it's time to start marking the different parts of the schema. Identification and adding this directive is only half the solution.

### How do we prevent this from logging?

### Automatically identify sensitive data based on heuristics

## Reactive measures

## Use the language

[sdl]: https://graphql.org/learn/schema/
[directive_locations]: https://spec.graphql.org/October2021/#DirectiveLocations
