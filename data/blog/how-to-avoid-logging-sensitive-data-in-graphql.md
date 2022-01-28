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

In this post, we will understand the power of declarative nature of GraphQL to solve a problem that requires its own discussions, audits, and other forms of dedicated time -- Monitoring.

Metrics collection, Logging, and Tracing are some primary forms of monitoring we implement in all services. In the logs, traces, or metrics, we want enough information to understand failures so that we are able to fix the bugs that caused those failures.

## Logging variables

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
mutation ($email: String!, $password: String!) {
  createAccount(email: $email, password: $password) {
    account {
      id
    }
  }
}
```

Here, we would have logged the `email` and `password` variables.

```json
{
  "timestamp": "2022-01-24 11:34",
  "variablesEmail": "foo@example.com",
  "variablesPassword": "Password$123"
}
```

Now, this is unsafe. Furthermore, image you handle user data in your GraphQL -- like

1. Creating an account
1. Updating password
1. Adding bank details
1. Add / update user's address data
1. etc.

A log containing user's sensitive information is never safe, it must fail the software audit, and must also never be in production. How do we avoid this?

## Identify sensitive data

One of the first steps in preventing such leaks is to identify them. Based on the business, different input or output fields in an API might classify as sensitive. As examples,

1. e-mail address, customer information like customer ID, IP address, or any other information that can be classified as personally identifiable data.
1. Health data
1. Financial data -- bank account, credit card numbers
1. passwords, tokens

Secondly, the parts of the system that use the sensitive data fields must be kept as minimal as possible. Isolating these data access in separate sections of the codebase will also be helpful in audits and reviews.

We are going to approach protecting sensitive data in two forms,

1. Proactive measures
1. Reactive measures

## Proactive measures

Acting before we identify a data leak of logging sensitive data is important in our server setup. Let's use the power of GraphQL to take these proactive measures. In the first section of the post, we discussed GraphQL directives. How can we leverage GraphQL directives to prevent sensitive data from ending up in our logs?

### Schema modeling

GraphQL is widely used to build UI. So, it's often the case in many business applications that the current user is always the context of the entire API usage. In other words, if there is no case for a client to get some other user's data, then this should reflect in the modeling.

For example, consider the following design --

```graphql
# not preferred
type Query {
  customer(id: ID!): Customer
}
```

In this model, the field takes in the customer ID as the input. This is a bad design if there is no business case for a user to get someone else's details. A better model would be to simply remove that input argument.

```graphql
# preferred
type Query {
  customer: Customer
}
```

Where do I get the ID from? Every request that asks for customer's information must already be authenticated. The token that passes the authentication must have this information along with the privileges or scopes the request can access. You can get the customer ID from the decoded token information.

### Marking sensitive inputs with a directive

We can let the user mark certain input arguments in the GraphQL query to be sensitive. But we cannot always rely on the user of the API to make this decision. So we have to annotate our server declaring which inputs are sensitive -- i.e., in the schema directly. We end up with the following directive --

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

**How do we prevent this from logging?**

\*\*

## Reactive measures

[sdl]: https://graphql.org/learn/schema/
[directive_locations]: https://spec.graphql.org/October2021/#DirectiveLocations
