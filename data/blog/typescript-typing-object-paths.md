---
title: TypeScript - Typing object paths
date: '2020-03-04'
tags:
  - TypeScript
  - JavaScript
draft: false
summary: In this post, I'm going to use some features of TypeScript that are often considered "advanced". In the first section, I'll mention most of the TypeScript features I'm going to use and also point to their documentation for references. The post is about how we can get stricter types for Object Paths for different use-cases.
---

In this post, I'm going to use some features of TypeScript that are often considered "advanced". In the first section, I'll mention most of the TypeScript features I'm going to use and also point to their documentation for references. The post is about how we can get stricter types for Object Paths for different use-cases.

## TypeScript Features used in this post

1. [Generic Types](https://www.typescriptlang.org/docs/handbook/generics.html#generic-types) - `type Foo<T> = Bar<T>`
1. [Generic Constraints](https://www.typescriptlang.org/docs/handbook/generics.html#generic-constraints) - `type Foo<T extends string> = Bar<T>`
1. [keyof types](https://www.typescriptlang.org/docs/handbook/release-notes/typescript-2-1.html#keyof-and-lookup-types) - `type Foo<T extends keyof X> = Bar<T>`
1. [Conditional Types](https://www.typescriptlang.org/docs/handbook/advanced-types.html#conditional-types) - `T extends U ? X : Y`
1. [Required type](https://www.typescriptlang.org/docs/handbook/utility-types.html#requiredt) - `type X = Required<Foo>`
1. [never type](https://www.typescriptlang.org/docs/handbook/basic-types.html#never) - `function noop(): never {}`

We will of course use a few other features of TypeScript such as type definitions, object types, etc... Also we will combine the above features to derive interesting solutions that we can adapt to our data structures.

## Object Path

An Object Path is representation of a nested field in a JavaScript object. There are a few ways an object path is written - a string with dot notation, an array of keys, etc... For example, let's take the following object -

```js
const repo = {
  login: 'boopathi',
  name: 'blog',
  defaultBranch: {
    name: 'master',
    headCommit: {
      id: '1234567',
      message: 'feat: add new post',
    },
  },
}
```

The object path to the commit message in repo will be `defaultBranch.headCommit.message` as a string or `[ "defaultBranch", "headCommit", "message" ]` when represented as an array. In TypeScript this object can be the type `Repository` in the following type definitions -

```ts
interface Repository {
  login: string
  name: string
  defaultBranch: Branch
}
interface Branch {
  name: string
  headCommit: Commit
}
interface Commit {
  id: string
  message: string
}
```

**But what should be the type of an object path in this object?**

## What is the type?

In most applications or libraries, the object paths are typed as a list of strings - `string[]`. But it is not strict enough for some cases. When we make a spelling mistake in the object path, we wouldn't know until it hits the runtime and an error is thrown. Also, for really big objects, one has to remember the path and the editor will be of no help when typing the object paths.

TypeScript is really good for intellisense. Instead of using object paths, if you directly use the object, the editor that talks to the TypeScript language-server can suggest you the possible names and validate these names right in-place. If you used the expression - `repo.defaultBranch.hea`, the editor would have suggested `headCommit`. A mistake or typo would be highlighted in-place. How do we get all these features when using object paths.

The other problem about using object paths in TypeScript is that you don't get the value type of the object path. `repo.name` as JS expression would say that it is a string. But a `lodash.get` using object path would be typed as `any` - `lodash.get(repo, ["defaultBranch", "name"])`.

So, in a gist,

1. Object paths are `string[]`
1. There is no validation of the static strings mentioned in object paths
1. The value at the object path is `any`

The goal is to teach TypeScript to have strong types for these things.

## Why is this useful?

Object paths are useful when we are dealing with a couple of levels of nested data in JavaScript. At [Zalando](https://www.zalando.de/), as discussed in my [previous post about GraphQL](https://blog.boopathi.in/graphql-optimization-field-filtering/), we use object paths to express dependency relation between two objects.

```js
const dependencyMap = {
  name: ['title'],
  price: ['price.currency', 'price.amount'],
  stock: ['stock_availability'],
}
```

It reads that each field in some type - `GraphQLProduct` depends on one or more fields in another type - `BackendProduct`. So, we have an object whose keys are the same as that of `GraphQLProduct` type and the values are an array of object paths. In this example, we have object paths in the string representation. But now, since we want to type it, we will use the array representation -

```js
const dependencyMap = {
  name: [['title']],
  price: [
    ['price', 'currency'],
    ['price', 'amount'],
  ],
  stock: [['stock_availability']],
}
```

## Thinking in Types

So, we have an array of _string_s, and an \_interface_ type and a couple of restrictions in the strings of what values they can be. Each element in the array is the `keyof` the object at its previous element. So, the type we want is -

```ts
    [ key1: keyof T, key2: keyof T[key1], key3: keyof T[key1][key2], ... ]
```

But it's not so straight forward in TypeScript to express this. So, we need a different way to express this. I've tried a couple of things and I've been most happy with the introduction of function that constructs this array instead of trying hard to type the array itself. There are a couple of advantages to it.

### Solution

The intersection type `& string` below limits the path lookup to strings.

```ts
function objectPath<
  Key1 extends keyof Product & string,
  Key2 extends keyof Product[Key1] & string,
  Key3 extends keyof Product[Key1][Key2] & string
  // ... for more nesting
>(k1: Key1, k2?: Key2, k3?: Key3) {
  if (k2) {
    if (k3) {
      // ... for more nesting
      return [k1, k2, k3]
    }
    return [k1, k2]
  }
  return [k1]
}
```

This will work for one type Product. But how do we make it work for any type - the answer is yet another generic type parameter. We use this generic in a factory like function so as to not repeat this common generic parameter over multiple usages. So, we end up with -

```ts
function createObjectPath<T>(_: T) {
  return function objectPath<Key1 extends keyof T>() {
    // .. above implementation
  }
}
```

This way, we are able to type object paths in nested structures and we get the benefits which we missed by typing them as a simple `string[]`. In usage, it is helpful for build time validation and gives all the advantages of stronger types. Now, our dependency map will look like this -

```ts
const backendPath = createObjectPath({} as BackendProduct)

const dependencyMap = {
  name: [backendPath('title')],
  price: [backendPath('price', 'currency'), backendPath('price', 'amount')],
  stock: [backendPath('stock_availability')],
}
```

We get autocompletion in editor, mistakes are highlighted, there are no chances of a typo of constant strings in code.

## Moar problems: Lists

This section deals with a specific case I have and might not be applicable for most scenarios of object paths. But, I do suggest you to read through this section as it brings out some tricks in TypeScript.

After we have this basic structure, soon we realize that this falls apart when we have lists in dependency maps. Most data structures have lists which are of same types. In this section we are going to avoid cases where the first list item is of type `Foo` and the second is of some other type `Bar`.

Let's start with an example -

```ts
interface BackendProduct {
  name: string
  images: Image[]
}
interface Image {
  uri: string
}

const product: BackendProduct = {
  name: 'Fancy Product',
  images: [
    { uri: 'https://example.com/image1.jpg' },
    { uri: 'https://example.com/image2.jpg' },
    { uri: 'https://example.com/image3.jpg' },
  ],
}
```

For the dependency map use-case, it's necessary to convey the dependency relation. Depending on your use-case, you should change this part to fit. The dependency relation does not care about array fields in object paths.

So, instead of expressing the object path in dependency map as -

```ts
backendPath('images', '0', 'uri')
```

we want to express it as -

```ts
backendPath('images', 'uri')
```

So, now, we have to teach TypeScript to look inside the array for the next key if we encounter an array. We will call this operation "Normalize". Also, along with this, we will make all the fields required in order to deal with `undefined`s in object paths.

To define this normalization, we need **conditional** types, **infer** types and **never** types to check if we have an array or object. The code for it would look like -

```ts
type ObjectPathNormalize<T> = T extends Array<infer U>
  ? U extends object
    ? Required<U>
    : never
  : T extends object
  ? Required<T>
  : never
```

This might be overwhelming, but it's just a nested conditional type which will look like this if we had expressed it in JavaScript -

```ts
ObjectPathNormalize = T =>
  if (Array.isArray(T)) {
    const U = infer(arrayElement(T))

    if ( isObject( U ) ) {
      return Required<U>
    }

    return never
  } else if ( isObject( T ) ) {
    return Required<T>
  }

  return never
```

## Putting it all together

When we use the normalize to each of the `Key` types in our `createObjectPath` definition, it becomes overwhelming pretty soon even for two keys -

```ts
function createObjectPath<T>(_: T) {
  return function objectPath<
    Key1 extends keyof Normalize<T>,
    Key2 extends keyof Normalize<Normalize<T>[Key1]>
  >(k1: Key1, k2?: Key2) {
    // ... implementation
  }
}
```

The `Normalize<Normalize<Normalize<T>[Key1]>[Key2]>[Key3]` can be extracted to a separate type. The complete implementation would look like -

```ts
type ObjectPathNormalize = T extends Array<infer U>
  ? U extends object
    ? Required<U>
    : never
  : T extends object
  ? Required<T>
  : never

type Normalize<T> = ObjectPathNormalize<T>

type Normalize1<T, Key1 extends keyof Normalize<T>> = ObjectPathNormalize<Normalize<T>[Key1]>

type Normalize2<
  T,
  Key1 extends keyof Normalize<T>,
  Key2 extends keyof Normalize1<T, Key1>
> = ObjectPathNormalize<Normalize1<T, Key1>[Key2]>

type Normalize3<
  T,
  Key1 extends keyof Normalize<T>,
  Key2 extends keyof Normalize1<T, Key1>,
  Key3 extends keyof Normalize2<T, Key1, Key2>
> = ObjectPathNormalize<Normalize2<T, Key1, Key2>[Key3]>

function createObjectPath<T>(_: T) {
  return function field<
    Key1 extends keyof Normalize<T>,
    Key2 extends keyof Normalize1<T, Key1>,
    Key3 extends keyof Normalize2<T, Key1, Key2>,
    Key4 extends keyof Normalize3<T, Key1, Key2, Key3>
  >(k1: Key1, k2?: Key2, k3?: Key3, k4?: Key4) {
    if (k2) {
      if (k3) {
        if (k4) {
          return [k1, k2, k3, k4]
        }

        return [k1, k2, k3]
      }

      return [k1, k2]
    }

    return [k1]
  }
}
```

[view raw](https://gist.github.com/boopathi/cddcf92c207e8adcf5df7224dc1b1533/raw/21fc4eb969e5a4021196d125416e5e140e521494/typescript-typing-object-paths.ts) [typescript-typing-object-paths.ts](https://gist.github.com/boopathi/cddcf92c207e8adcf5df7224dc1b1533#file-typescript-typing-object-paths-ts) hosted with ❤ by [GitHub](https://github.com)

## Conclusion

This post explains concepts which solve some really specific use-cases I had. The aim of this post was not to publish it as a library for all object path use-cases. It is to take advantage of stricter types in places where stricter types are not available for free or are harder to define.

TypeScript has lot of powerful features and also a lot of limitations. Only by solving existing problems in our data structures better, we understand the power and the limitations of TypeScript at the same time.

If you have any comments or doubts or suggestions to improve the above code, please feel free to tweet to me at [@heisenbugger](https://twitter.com/heisenbugger).
