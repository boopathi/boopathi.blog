---
title: How to avoid logging sensitive data in GraphQL
date: '2022-01-29'
tags:
  - GraphQL
  - Optimization
  - JavaScript
  - Sensitive Data
draft: false
summary: >-
  Metrics, Logging, and Tracing are some primary forms of monitoring we use in
  our services. In this post, I talk about how we can leverage the power of
  GraphQL to prevent sensitive information ending up in these monitoring tools.
images:
  - /static/blog/how-to-avoid-logging-sensitive-data-in-graphql/twitter-card.png
---

In this post, we will focus on the declarative nature of GraphQL to solve the leakage of sensitive data to monitoring tools. Metrics collection, Logging, and Tracing are some primary forms of monitoring we implement in all services. In the logs, traces, or metrics, we want enough information to understand failures so that we are able to fix the bugs that caused those failures.

## Overview

<TOCInline toc={props.toc} exclude="Overview" toHeading={3}/>

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

Acting before we identify a data leak of logging sensitive data is important in our server setup. For the scope of this blog post, we will focus only on the technical aspects under proactive measures related to GraphQL.

## Schema modeling

GraphQL is widely used to build UI. So, it's often the case in many business applications that the current user is always the context of the entire API usage. In other words, if there is no case for a client to get some other user's data, then this should reflect in the modeling.

For example, consider the following design --

```graphql
# not preferred
type Query {
  customer(id: ID!): Customer
  healthStats(id: ID!): HealthStats
}
```

In this model, the field takes in the customer ID as the input. This is a bad design if there is no business case for a user to get someone else's details. A better model would be to simply remove that input argument.

```graphql
# preferred
type Query {
  customer: Customer
  healthStats: HealthStats
}
```

Where do I get the ID from? Every request that asks for customer's information must already be authenticated. The token that passes the authentication must have this information along with the privileges or scopes the request can access. You can get the customer ID from the **decoded token** information.

## `@sensitive` directive

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

### How do we prevent this from logging?

Arguments marked with the `@sensitive` directive can be read from the AST of the query during execution. All we need to do is go through the AST of the query and compare it with the corresponding schema types. In GraphQL-JS there is a function that offers this capability in-built. While the `visit` function offers a way to visit the nodes of the AST of either the schema or the query, visiting them in a way where correlating the variable with an argument seems not straight-forward.

Fortunately, there is a simpler alternative -- i.e., to use `validate` function. The `validate` function takes both the query document AST and the built schema as input and offers the same visitor pattern that `visit` uses.

### `getSensitiveVariables`

1. We use the visitor pattern and visit all `Variable` nodes in the query. Note: Variable corresponds to the Variable usage, while `VariableDefinition` corresponds to the declaration at the query level.

   ```graphql
   query (
     $idVar: ID! # <- $idVar is VariableDefinition
   ) {
     product(id: $idVar) # <- $idVar is Variable
   }
   ```

1. The visitors receive a `context`. The context has access to the schema and has many helpers to get to different parts of the schema with ease.
   ```ts
   validate(document, schema, {
     Variable(context) {},
   })
   ```
1. `context.getArgument` inside the _Variable_ visitor would return the definition of the argument. This method returns the argument definition in the **schema** -- `id: ID!`. This is the connection between the schema and query we discussed previously.
   ```graphql
   type Query {
     product(id: ID!): Product
     #       -------
     # context.getArgument returns this
     # argument defintion `id: ID!` in schema
   }
   ```
1. Once we made that connection from the query to the schema, we can go through the argument's (return value of `context.getArgument`) AST. This AST will have the directives.
   ```ts
   context.getArgument()?.astNode?.directives
   ```
1. We just go over the list of directives in this argument and check if we use `@sensitive`.

The complete implementation using GraphQL-JS would look like this --

```ts
import { GraphQLSchema, DocumentNode, validate } from 'graphql'

const hasSensitiveDirective = (directive) => directive.name.value === 'sensitive'

function getSensitiveVariables(document: DocumentNode, schema: GraphQLSchema) {
  const sensitiveVariables: string[] = []

  validate(schema, document, [
    (context) => ({
      Variable(node) {
        const directives = context.getArgument()?.astNode?.directives
        if (directives?.some(hasSensitiveDirective)) {
          sensitiveVariables.push(node.name.value)
        }
      },
    }),
  ])

  return sensitiveVariables
}
```

### `getLoggableVariables`

Now, we have the list of sensitive variables. While logging, we can use this list to remove all the sensitive variables just before logging. An example implementation of the logger --

```ts
type Variables = {
  [key: string]: any
}
function getLoggableVariables(variables: Variables, sensitive: string[]) {
  const loggableVariables: Variables = {}
  let hasLoggableVariables = false

  for (let name in variables) {
    if (!sensitiveVariableNames.includes(name)) {
      hasLoggableVariables = true
      loggableVariables[name] = variables[name]
    }
  }

  if (hasLoggableVariables) return loggableVariables
  return
}
```

### Enforcing `@sensitive` heuristics

The sensitive directive is useful to mark input arguments in the schema. But, it must be manually done. We are dealing with sensitive data leaked to our logging and monitoring platforms. Based on our business and products, we can already identify a list of potential sensitive names that will be used in the schema.

This knowledge enables us to again use the declarative nature of GraphQL to build more tools -- i.e., a linter that checks for certain names in argument and enforces the usage of `@sensitive` directive.

A rough list of fields (incomplete) for an ecommerce platform could look like this --

```
email,password,phone,firstname,lastname,street,zip,bank,account,owner,orderid
```

Using the schema-linter project -- [graphql-schema-linter][graphql_schema_linter], we can write a rule that checks if the argument contains these above listed names. If it does, and the argument does not contain the `@sensitive` annotation / directive, we fail the lint.

The implementation of the linter rule is certainly not going to fit within a blog post. So, here is a gist to this implementation -- [sensitive-heuristics.js][sensitive_heuristics]

## Conclusion

Along with the proactive measures of preventing leak of sensitive data in our monitoring platforms, we also must focus on the reactive measures. The reactive measures involve a lot around audits, policies, and contracts drafted by the company or organization. The reactive measures are probably more important than the proactive measures as we must assume all software has bugs. With these tools and techniques we discussed above, mitigation using 'reactive measures' becomes simpler and simpler.

I hope you learned a bit more about GraphQL directives from this blog post. Please do share how you use GraphQL directives in your projects.

As always, if you have any doubts or comments or questions or fixes for this post, please feel free to tweet to me at [@heisenbugger](https://twitter.com/heisenbugger).

[graphql_schema_linter]: https://github.com/cjoudrey/graphql-schema-linter
[sensitive_heuristics]: https://gist.github.com/boopathi/82999b851b484911fe6f86832733c921
