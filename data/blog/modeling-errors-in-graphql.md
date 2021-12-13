---
title: Modeling errors in GraphQL
date: '2020-03-09'
tags:
  - GraphQL
  - Design
draft: false
---

GraphQL is a great language for writing data requirements in a declartive fashion. It gives us a clear and a well-defined concept of nullability constraints and error propagation. In this post, let's discuss how GraphQL lacks in certain places with regards to errors and how we can model those errors to fit some of our use-cases.

Before we dive into the topic, let's understand how GraphQL currently treats and handles errors. The response of a GraphQL query is of the following structure —

```json
{
  "data": {
    "foo": null
  },
  "errors": [
    {
      "message": "Something happened",
      "path": ["foo", "bar"]
    }
  ]
}
```

## Error extensions

The schema we define for GraphQL is used only in the `data` field of the response. The `errors` field is a well defined structure — `Array<{ message: string, path: string[] }>` in its simplest form. The schema we define does not affect this error.

Let's say the client queries a field using an ID. How can the client know from the above error object whether the error is due to an Internal Server Error or the ID is Not Found. Parsing the message is a no-go beacuse it is not reliable.

Luckily, in GraphQL, there is a way to provide extensions to the error structure - using `extensions`. The `error.extensions` can be used to convey other information related to the error - properties, metadata, or other clues that the client can benefit from. As for the above example, we can model the response to be —

```js
const err = {
  data: {},
  errors: [
    {
      message: 'Not Found',
      extensions: {
        code: 'NOT_FOUND',
      },
    },
  ],
}
```

## Errors for Customers

When we have a GraphQL API that is used to deliver content to the end-user — the customers, i.e. we have two levels of users —

1. The **consumer** or **user** of the API — UI/UX/front-end developer.
1. The **end-user** or **customer** — The one who does not see any of the technical layers, but gets the product's experience in its most presentable format. The Front-end developer builds this experience using data from the GraphQL API.

Since using the word **user** might be confusing, from now on, **Consumer** will refer to the front-end developer and **Customer** will refer to the end-user.

When we have an API whose data is directly consumed by two levels of these users - Consumer and Customer, there might be different error data requirements. For example, let's take `mutations` —  when the customer enters an invalid email address,

1. The Consumer of the API needs to know that the Customer has entered an Invalid Email address via a **parseable format** — a boolean or enum or whatever data structure you choose will work except parsing the error message.
1. The Customer needs cares about the error message in a nicely styled format close to the text box. Oh!, one more thing, for **different languages** or locales, the error message needs to be in the corresponding **translated** text.

Let's try to model this using the error extensions discussed above —

```json
{
  "data": {},
  "errors": [
    {
      "message": "Die e-mail Adresse ist ungültig",
      "extensions": {
        "code": "INVALID_EMAIL"
      }
    }
  ]
}
```

While this would work, we soon end up in a case where multiple input fields in a mutation can be invalid. What can we do here? Do we model them as different errors or fit everything into the same error.

The Customer errors still need to be usable by the Consumers so as to propagate it — the front-end developers are the ones ultimately transforming our data structures to UI elements. So they need to understand the error to highlight that input text-box with a **red** border. So, to make it easy, let's try modeling these as a single error with multiple validation messages —

```json
{
  "data": {},
  "errors": [
    {
      "message": "Multiple inputs are invalid",
      "extensions": {
        "invalidInputs": [
          {
            "code": "INVALID_EMAIL",
            "message": "Die e-mail Adresse ist ungültig"
          },
          {
            "code": "INVALID_PASSWORD",
            "message": "Das Passwort nicht erfüllen Sicherheitsstandards"
          }
        ]
      }
    }
  ]
}
```

The codes `INVALID_EMAIL`, and `INVALID_PASSWORD` will help the front-end dev or consumer to highlight the field in the UI, and the message will be displayed to the user right under that textbox.

This becomes a complicated structure very soon and is not as friendly as data modeled with a GraphQL schema.

## Why you no Schema?

![Why you no schema?](/static/images/why-u-no-schema.jpg)

The biggest problem we face in modeling all of requirements inside the extensions object is that it's not discoverable. We use such a powerful language like GraphQL to define each field in our big data structure using Schemas, but when designing the errors, we went back to a loose mode of not using any of the ideas GraphQL brought us.

Maybe, in future extensions of the language, we are able to write schemas for Errors like we write for Queries and Mutations. The developers using the schema get all the benefit of GraphQL even when handling errors. For now, let's concentrate on modeling this using the existing language specification.

## Errors in Schema

We want to enjoy the power of GraphQL - the discoverability of fields of data, the tooling, and other aspects for errors. So, why not simply put some of these errors in the Schema instead of capturing them separately in the error extensions.

For example, the mutation discussed previously can be modeled like this —

1. mutation returns a `Result` type
1. Result type is a `union` of Success, Error.
1. Error schema contains necessary error info — like translated messages, etc...

```gql
type Mutation {
  register(email: String!, password: String!): RegisterResult
}

union RegisterResult = RegisterSuccess | RegiterError

type RegisterSuccess {
  id: ID!
  email: String!
}

type RegisterError {
  invalidInputs: [RegisterInvalidInput]
}

type InvalidInput {
  field: RegisterInvalidInputField!
  message: String!
}

enum RegisterInvalidInputField {
  EMAIL
  PASSWORD
}
```

This structure looks exactly like the one we designed above inside error extensions. The advantage of modeling it like this would be that we are using the benefits of GraphQL for errors.

## When you have a hammer,

Now, we are left with a couple of questions more than answers, and this is good.

1. Should I model all errors as GraphQL types?
2. How should I decide when to use error extensions and when to use GraphQL types for modeling errors?
3. etc...

When working in big teams, many people contribute and think about modeling different parts of the schema. There should be clear definitions for many aspects of the existing data structures, and the idea behind how we reached such solutions. The design and schema is changed or modified far fewer times than it is read / used.

GraphQL gave us the mindset of "[Thinking in Graphs](https://graphql.org/learn/thinking-in-graphs/)". If we are suggesting a new way of modeling errors, we need to talk about this mindset and ideas behind them. Not all errors fit into this modeling (error types in schema) and it will make the GraphQL API less usable if we approach it by looking at all the errors as nails.

## Classification

In order to model errors, let's try to find some analogies. I'd like to think about modeling these errors in terms of programming languages errors. For example,

1. Go: error vs panic
2. Java: Error vs Exception
3. Rust: error vs runtime exception

The programming languages also model errors as 2 variants. In one model, for example, an `error` type in go, it informs the consumer of the function and the consumer decides either to handle it or to pass it through. In the other variant, for example, `panic` in go, it skips everything and brings the program to a halt to inform the end-user of the program that something has happened. This small variation captured as two different things help us understand the intention of data in errors.

### Part 1. Action-ables

What is an error? It tells us that something is wrong and gives us some information of what action can be taken. We can think of errors as containers of **action**\-ables. When modeling them, we classify them into different groups depending on **who** can take that action.

In GraphQL context, for some errors, the front-end takes care of it — either by a fallback or a retry. In case of some other errors like the invalid inputs, the front-end cannot take an action, only the customer who entered the invalid input can take the action — fixing the input.

Instead of modeling the errors loosely, we now have a solid use-case — model it for the whoever can take the action.

### Part 2. Bugs in the system

Errors convey information — either to Consumer or Customer. If the error is conveying some bug in the system, then it should **not** be modeled as schema error types. Here, system means all the services and software involved in our entire Product and not just the GraphQL service. This is important because it separates the view of the end-user / customer vs consumer of the API. The end-user looks at our product as one thing not many individual services.

In the 404 Not Found case, if we had modeled the errors as schema types, it would make the schema less usable. Let's take a product look-up use-case —

```gql
{
  product(id: "foo") {
    ... on ProductSuccess { }
    ... on ProductError { }
  }
  collection(id: "bar") {
    ... on CollectionSuccess {
      products {
        ... on ProductSuccess {}
      }
    }
    ... on CollectionError {}
  }
}
```

This way of handling errors at every level is not friendly for front-end developers. It's too much to type in a query and too many branches to handle in the code.

### Part 3. Error propagation

We also have to remember to not disrupt GraphQL semantics of error propagation. If an error occurs in one place in the query, it propagates upwards in the tree till the first non-null field occurs. This does not happen with error types in schema. It is important to model these schema error types for only specific use-cases. This goes back to Part 1: Action-ables — we design these types for actions that the end-user or customer can take.

## The Problem type

Naming is half the battle in GraphQL. Since the name `error` is already taken by the GraphQL language (`response.errors`), it would be confusing to name our error types in schema as `Error`. As we did before to look for inspirations, there is a well-defined concept in [IEFT — RFC 7807 — Problem details for HTTP API](https://tools.ietf.org/html/rfc7807). So, we are going to call all our errors in schema as Problems and as it has always been, all other errors as errors.

The above register schema with the problem type would look like this —

```gql
type Mutation {
  register(email: String!, password: String!): RegisterResult
}

union RegisterResult = RegisterSuccess | RegiterProblem

type RegisterSuccess {
  id: ID!
  email: String!
}

type RegisterProblem {
  "translated message encompassing all invalid inputs"
  title: String!
  invalidInputs: [RegisterInvalidInput]
}

type InvalidInput {
  field: RegisterInvalidInputField!
  "translated message"
  message: String!
}

enum RegisterInvalidInputField {
  EMAIL
  PASSWORD
}
```

## Problem or Error

Problem refers to the error as a schema type. Error refers to the error that appears in the `reponse.errors` array with an error code at `error.extensions.code`.

### Case 1: Resource Not Found

This is a bug in the system in case of navigation. If the user navigates from the home page to a product page, and they end up in a 404 page, it means that some service provided an id that is already not found. It's not something because the user entered some input. Also, these errors need to be propagated. So, this becomes an Error with an error code as `NOT_FOUND` and not a Problem.

### Case 2: Authorization

Authorization errors are of the Error type and do not fit a problem type. Here, the action taker looks like it's the customer who needs to login. But, the UI can take an action here and show a login dialog box to the customer. In apps, the app decides to take the customer to the login view. The action really belongs to the Front-end and only then the customer. So, we model it for the consumer / front-end as an Error with error code `NOT_AUTHORIZED` and not a Problem.

### Case 3: Mutation Inputs

This is the only case where it is important to construct Problem types. This contains inputs directly from the customer, and only the customer can take an action for this. So, we model these errors as Problems and not Errors.

### Case 4: All other bugs / errors

Any runtime exception in the code or Internal Server Errors from any backends that the GraphQL layer connects to should be modeled as Error and need not contain an error code. This way it is easy for front-end to treat all non error code responses as Internal Server Errors and take an action accordingly — to retry or show the customer a 500 page.

## Conclusion

We have discussed Problem type as a possible solution where the error object in GraphQL response does not suffice the use-cases. But we have to be careful about not overusing this for lot of use-cases where the error extensions already provide enough value.

We have to understand that the Problem type in **unnecessary** places does make the query and front-end code complicated. Our GraphQL schema should try to simplify and provide a friendly interface.

This blog post got longer than I expected. Thanks for reading it through.

As always, if you have any doubts or comments or questions or fixes for this post, please feel free to tweet to me at [@heisenbugger](https://twitter.com/heisenbugger).
