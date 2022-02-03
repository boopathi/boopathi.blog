---
title: Memoizing an n-ary function in TypeScript
date: '2022-02-03'
tags:
  - TypeScript
  - JavaScript
  - Optimization
draft: false
summary: >-
  In this post, I talk about an approach to memoizing a n-ary function in
  JavaScript / TypeScript preserving the flow of types.
images:
  - /static/blog/memoizing-an-n-ary-function-in-typescript/twitter-card.png
---

## Overview

<TOCInline toc={props.toc} exclude="Overview" toHeading={3}/>

## What is memoization?

When a function is likely to be called multiple times with the same input, it makes sense to store this input and the corresponding output and reuse it. We know that the function would return the same value every time for the same input. This act of storing results to make the function run faster is memoization.

In most problems, the problem itself might not be memoizable. We need to break the problem down to sub-problems that are possible to memoize. Some of the best examples to understand memoization are the Fibonacci generator or the Factorial number generator. In these problems it's very easy to see how the problem can be broken down into repetitive sub-problems where the inputs are the same.

There are many great articles and posts that discuss these in detail. For the scope of this blog post, let's proceed ahead with making the problem a bit more complex.

## `n-ary` function

Arity of a function is the number of arguments a function takes as input. `n-ary` means the function takes `n` arguments as input. Most memoization libraries, for example, [`lodash.memoize`][lodash_memoize], use the memoization technique for a 1-ary or unary function (a function that takes only one input).

## The problem

Sometimes, we have a function that takes 2 inputs, and we want to memoize that function. _How do we approach this problem? What does memoization mean for a function with two inputs?_ If we look at a simple implementation of memoization,
we have a map where we store our results.

```ts
function memoize<Input, Result>(fn: (input: Input) => Result) {
  const memoMap = new Map<Input, Result>()
  return function (input: Input): Result {
    if (memoMap.has(input)) return memoMap.get(input)!

    const result = fn(input)
    memoMap.set(input, result)
    return result
  }
}
```

In this example, if we were to use two inputs, how would we store the result? Would we use a map of map or is it for a pair of inputs?

### Just wrap the inputs in an array or object

Let's consider combining the inputs into an array or an object to make it a single input. As JavaScript developers, we immediately know why creating that wrapper object or array would not work as the key of a map. They are passed by reference. Every time the function executes, a `{}` or `[]` syntax creates a new object, and the `map.has(obj)` check will fail.

To check the memo works, we can introduce a side effect in the original function.

```ts
function add(a, b) {
  console.log('perform expensive computation')
  return a + b
}
const memoAdd = memoize(([a, b]) => add(a, b))
// first call saves the output
memoAdd([5, 10])
// these calls must return result from the map
// but they won't because every [5,10] is a new reference
memoAdd([5, 10])
memoAdd([5, 10])
```

Every time we call `memoAdd` with `[5,10]`, it results in calling the original function. You can observe by running this and seeing the logs multiple times. This is because `[]` creates a new array and its reference becomes the key of the `memoMap`. The same applies for objects `{}` as well.

We can, of course, create the input once and use it multiple times --

```ts
const input = [5, 10]
memoAdd(input)
memoAdd(input)
```

It's not realistic to assume that all our function calls share the same space in code. Usually, the function calls happen from different parts of the codebase, or it is harder to share the input reference.

### Stringify

_Can we stringify the input as string equality check is by value instead of reference?_ As you might have already realized, this has its own drawbacks. There is also an extra parse step that must happen inside the function implementation. It can become counterproductive, as stringify and then parse will cost more computation in the process we are trying to optimize.

Also, the order of keys in an object are not certain. It takes the insertion order. So stringifying that requires special stringify methods. Even if it's an array, the same problems occur if the n-ary input contains objects or arrays.

### Why libraries use unary functions for memoization

As you can see, the methods we explored so far have severe drawbacks that the libraries cannot assume. It has to work for a general case. The general case is in the simplest form -- a unary function.

## Currying

One of the core issues is that we were trying so far to fit multiple arguments into a single argument. What if we treated each argument as a separate function. In this process, we are converting an n-ary function to multiple unary functions. It is known as 'currying'.

In short, currying can be visualized as --

```ts
foo(a, b, c, d)
// becomes
curriedFoo(a)(b)(c)(d)
```

If we take the function add,

```ts
function add(a, b) {
  return a + b
}
```

currying this function would return the following function --

```ts
function curriedAdd(a) {
  return (b) => a + b
}
```

Now, we have a chain of nested unary functions. And we can memoize unary functions using any memoization library like [lodash.memoize][lodash_memoize]. _Did we solve the problem of memoizing an n-ary function?_

## Nested maps

We still have to memoize them at each level. Otherwise, it would be incomplete. Let's visualize the concept of what we achieve by currying --

```ts
// original function
function add(a, b) {
  return a + b
}

// curried function
function curriedAdd(a) {
  return (b) => a + b
}

// memoized and curried function
const memoizedCurriedAdd = memoize((a) => memoize((b) => a + b))

// calling memoized n-ary function
memoizedCurriedAdd(5)(10)
```

Memoize creates a map whose keys are inputs of the unary function and values are outputs. If you look at the `memoizedCurriedAdd` definition, the result of the outer function is another memoized function. So we would essentially end up with the following nested map represented as a JS object --

```ts
map = {
  [a]: memoizedFunction({
    [b]: result,
  }),
}
```

Another way to implement this memoized function is to simply store the results in a nested map ourselves -- i.e., instead of using value as another memoized function, it will point to a map. But the concept remains the same.

## Recreating the original n-ary function

A nice property of memoizing unary functions is that the original API is unchanged. The input and output types are the same.

```ts
type UnaryFn<Input, Result> = (input: Input) => Result
function memoize<Input, Result>(fn: UnaryFn<Input, Result>): UnaryFn<Input, Result>
```

What memoize returns has the exact same signature. Can we achieve this for our curried function? Can we `uncurry` it? Of course, let's take a look at how we can do it --

```ts
// memoized curried function
const memoizedCurriedAdd = memoize((a) => memoize((b) => a + b))

// memoized uncurried function
const memoizedAdd = (a, b) => memoizedCurriedAdd(a)(b)
```

### Determining number of uncurries

The next step is to generalize uncurry function. We did not do this for the curry function because we have to also memoize every step of currying. But uncurry, it's just a function call with a different API.

The JavaScript language supports variadic arguments in two forms --

1. Rest operator

   ```ts
   function foo(...rest) {
     rest // [list of arguments]
   }
   ```

1. `arguments` variable
   ```ts
   function foo() {
     arguments // { 0: first, 1: second, and so on.. }
   }
   ```

Because of variadic arguments support, we cannot reliably know from the function it's arity. `<function>.length` gives the arity if there are no variadic arguments. Otherwise, it's just `0`. **We need to know the arity of the function to do the number of uncurries.**

So, our only option is to define uncurry for each arity. We also want the types to flow so that we use strict types everywhere. And that this entire process should not degrade the type info of the original function. Here is the uncurry function for various arities.

```ts
// uncurry into a 2 arity function
function uncurry2<A, B, R>(fn: (a: A) => (b: B) => R) {
  return (a: A, b: B) => fn(a)(b)
}

// uncurry into a 3 arity function
function uncurry3<A, B, C, R>(fn: (a: A) => (b: B) => (c: C) => R) {
  return (a: A, b: B, c: C) => fn(a)(b)(c)
}

// uncurry into a 4 arity function
function uncurry4<A, B, C, D, R>(fn: (a: A) => (b: B) => (c: C) => (d: D) => R) {
  return (a: A, b: B, c: C, d: D) => fn(a)(b)(c)(d)
}

// you can extrapolate this if you need more
```

## `n-ary` memoize definition

The same problem that the uncurry faces, memoize faces too. Due to variadic arguments support, we cannot reliably define a single function for memoizing an n-ary function. So, we must define for each arity.

Using similar principles we need all the types to flow such that we get the type definition that is the same as the original function.

Let's start by defining `memoize2` that memoizes a 2-arity function --

```ts
type Fn2<A, B, R> = (a: A, b: B) => R
function memoize2<A, B, R>(fn: Fn2<A, B, R>): Fn2<A, B, R> {
  return uncurry2(memoize((a: A) => memoize((b: B) => fn(a, b))))
}
```

Let's reiterate what is happening in this function. We will unwrap it inside out.

1. `memoize` is a unary memoization function. It takes a unary function and returns a unary function that's memoized.
1. The nested memoize does the currying and memoization together. It creates a nested memoization of `fn(a, b)` and returns `memoizedCurriedFn(a)(b)`.
1. `uncurry2` removes the curry used for memoization and returns the original API of the function `fn`.
1. As you can see in the input value and return value, the input function's signature is `Fn2<A, B, R>`. The return value is also exactly the same.

We can extrapolate this and define `memoize3` and memoize for higher arity functions.

```ts
type Fn3<A, B, C, R> = (a: A, b: B, c: C) => R
function memoize3<A, B, C, R>(fn: Fn3<A, B, C, R>): Fn3<A, B, C, R> {
  return uncurry3(memoize((a: A) => memoize((b: B) => memoize((c: C) => fn(a, b, c)))))
}
```

## Example

That's all folks! Let's try out an example,

```ts
function add(a, b, c) {
  return a + b + c
}

const memoizedAdd = memoize3(add)

// would call the function
memoizedAdd(5, 10, 15)

// would return the memoized value
memoizedAdd(5, 10, 15)
```

## Conclusion

It was an interesting journey trying to solve a simple-to-understand problem, but yet we went into various aspects of the language, type system, usage of generics for proper flow of types, and concepts like currying and uncurrying. I hope the post was useful in knowing a bit more about JavaScript or TypeScript.

If you have any doubts or comments or questions or fixes for this post, please feel free to tweet to me at [@heisenbugger](https://twitter.com/heisenbugger).

[lodash_memoize]: https://lodash.com/docs/4.17.15#memoize
[graphql]: https://graphql.org
[ast]: https://en.wikipedia.org/wiki/Abstract_syntax_tree
[jit_resolve_info]: https://github.com/zalando-incubator/graphql-jit/blob/main/src/resolve-info.ts
