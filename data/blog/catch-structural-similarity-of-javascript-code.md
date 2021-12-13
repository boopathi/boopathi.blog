---
title: Catch structural similarity of JavaScript code
date: '2019-11-06'
tags:
  - JavaScript
draft: false
---

Project Source code: [https://github.com/vigneshshanmugam/js-cpa](https://github.com/vigneshshanmugam/js-cpa)

_Project authors:_

- [Boopathi Rajaa (myself) (@boopathi on GitHub)](https://github.com/boopathi)
- [Vignesh Shanmugam (@vigneshshanmugam on GitHub)](https://github.com/vigneshshanmugam)

Let's begin by observing the following code -

```js
function foo(a, b) {
  return a + b
}

// somewhere else in another file
function bar(c, d) {
  return c + d
}
```

These two functions do the exact same thing. Sometimes in our big or medium-sized projects, we face multiple implementations of the same logic. These implementations have some properties -

- They might be written by different developers
- They mostly likely do not use the same names
- They are structurally similar to some extent

This post is about how do we detect some of the cases where we have possibly repeated code in the same project or across multiple projects. This code if necessary can be extracted into a common module so as to avoid fixing bugs multiple times.

## a === b

The first part of what we are trying to find involves figuring out how to equate two code blocks and see if they are doing the same thing. There are multiple simple ways to do it and each of them have different errors. For example, simply executing the code and comparing outputs would not be able to capture side-effects, and would not capture elements like `Math.random` or similar other operations. Also, comparing the source code wouldn't suffice because the variable names might not be the same.

We need some kind of representation of the code that is not the complete code but only represents something without the details. And this is similar to what hashing functions do. So, we are going to name our function that parses the code and converts it to some form as a hashing function that we will implement. A generic hashing function would not work because it considers each character of the source code. So, we are going to write our own hash function that represents the structure of the code.

## Hash consing

[https://wikipedia.org/wiki/Hash_consing](https://wikipedia.org/wiki/Hash_consing)

Hash Consing (Computer Science) is a technique to share values that are structurally equal. Sounds perfect! So we figured out the name of what we want to achieve. Our input is the source code in [AST](https://en.wikipedia.org/wiki/Abstract_syntax_tree)(Abstract Syntax Tree) form and it's a tree structure. At each point in the tree we are going to compute the hash by aggregating the hashes of its children.

```js
function hashcons(node) {
  // hashCode implementation discussed below
  let hash = hashCode(node)
  for (const key of getChildKeys(node)) {
    if (Array.isArray(node[key])) {
      for (const child of node[key]) {
        hash += hashcons(child)
      }
    } else {
      hash += hashcons(node[key])
    }
  }
}
```

Given a node in the AST, we compute something called the hashCode for the current node and simply append the hashCode of the child nodes recursively.

### hashCode

This is where the trick is to determine what represents structure. We can either go super granular by returning the stringified form of the AST (the source code) or control the granularity by removing details. For the use cases we had, the following considerations worked well.

- Variable names are ignored. But, identifiers in object member expressions, property names, etc... might be important to keep.
- Ignore comments. I think this goes true without further explanation.
- Magic constants are important. `"foo"`, `42`, `true`, etc... are important to be a part of the hash. `a === true` and `a === false` are different for the application we have. Our aim is to eliminate common code repeated in our projects.
- We must not differentiate between different types of functions - function declaration, function expression, arrow functions. But we must differentiate between this and an async function or generator function or an async generator function.

## Finding duplicates

From the `hashCons` logic we go through the AST and apply the hash for each node in the AST by adding a new property for the nodes - `node.hash`. The next step is to compare nodes' hashes to find duplicates. Here, we have another problem -

```js
function foo(a) {
  return function bar(b) {
    return a + b
  }
}

// and another structurally similar function,
function adder(a1) {
  return function add(a2) {
    return a1 + a2
  }
}
```

From now, the word similar in this post would mean that the hashes are the same `node1. hash === node2.hash`.

In the above example, we have `4` functions and two pairs of similarities. `foo` and `adder` are similar; `bar` and `add` are similar. But, if we detected expression similarities as well, `a + b` is similar to `a1 + a2`. This will be a lot of data and it is not really useful in reality. There is way too much noise than the actual problems highlighted. So we should remove these things from our result.

## Longest common subsequence

[Longest Common Subsequence](https://en.wikipedia.org/wiki/Longest_common_subsequence_problem)(LCS) is the algorithm we need for removing the noisy results in the duplicates we found. Instead of the traditionally defined technique of finding LCS, we are going to do something different. I can't remember the why, but it was natural for us to solve it this way. If you think there is a better way, I'll be happy to discuss it in the repository and possibly send a pull-request.

Our technique here involves running a Depth First traversal twice on the AST. The first time we traverse we traverse in a `Post-Order` fashion and compute the hashes of the nodes along the way. This ensures that we compute the child nodes first and aggregate bottom-up till the root. Along the way, we also mark all the duplicates by making a `Map` with the keys as hashes. And the logic somewhat looks like this -

```js
let hashes = new Map()
dfs(root, {
  exit(node) {
    if (!node.hash) {
      node.hash = hashCons(node)
    }

    if (hashes.has(node.hash)) {
      hashes.set(node.hash, [...hashes.get(node.hash), node])
    } else {
      hashes.set(node.hash, [node])
    }
  },
})
```

After we collect this, the second Depth First Traversal is run. This time, we do it in a `Pre-Order` fashion. It is `pre-order` because once we detect a node which is duplicate of another, we ignore traversing further down the tree. This way we are sure that the duplicates we found are the longest common subsequence.

```js
const duplicates = {}
dfs(root, {
  enter(node) {
    if (node.isDuplicate) {
      if (duplicates.hasOwnProperty(node.hash)) {
        duplicates[node.hash].push(node)
      } else {
        duplicates[node.hash] = [node]
      }

      // and we mark the traverser to skip further down
      node.shouldSkip = true
    }
  },
})
```

That's all Folks!. If you made it so far, thanks a lot for reading. The next section includes other details that you might be interested in about the project.

---

## Parser

We use Babel project's JS parser - `[@babel/parser](https://github.com/babel/babel/tree/master/packages/babel-parser)` to get the AST.

## Traverser

What is the DFS traverser you use that has properties like `enter`, `exit`, `shouldSkip`?

The DFS traverser is a custom one that is similar to how [Babel traverse](https://github.com/babel/babel/tree/master/packages/babel-traverse) works. When you use the method `enter` callback, it is called before the current node is visited, and for the `exit` callback, it is after the current node is visited. This simple technique allows us to use `pre-order` and `post-order` traversal in the same function.

```js
function dfs(node, { enter, exit }) {
  // pre-order call
  enter(node)

  if (!node.shouldSkip) {
    const keys = getFields(node)

    for (const key of keys) {
      const child = node[key]

      if (Array.isArray(child)) {
        for (const c of child) {
          dfs(c)
        }
      } else {
        dfs(child)
      }
    }
  }

  // post-order call
  exit(node)
}
```

How do you know what are the next nodes to visit? What is `getFields` in the above implementation?

This is where the `[babel/types](https://github.com/babel/babel/tree/master/packages/babel-types)` package comes in for help. The types package has a map of type names to children keys the type name will have. The `getFields` in the above implementation is simply `return t.VISITOR_KEYS[node.type]`.

## Reporters

Now that we have a way to find duplicates, we need a clean way to report these things to make it user friendly. We have a CLI that goes through a pattern of files and reports the duplicates found in the terminal in a pretty printed format. [@Sylvester Aswin](https://github.com/sylvesteraswin) extended the CLI and built a web UI to view the report of the duplicated code across files.

## Webpack Plugin

If you use webpack to bundle, here is a handy plugin that identifies duplicate code between bundles and reports it.

Plugin: [https://github.com/vigneshshanmugam/bundle-duplicates-plugin](https://github.com/vigneshshanmugam/bundle-duplicates-plugin)

---

## Conclusion

We used the project in different codebases which were NodeJS services, React JS applications, etc... and found interesting places where code gets repeated in different forms. It helped us reduce the bundle size of the application to some extent and also helped us have a fun time grokking around and optimizing the project. Though we are not actively working on the project because of other workload, I think it would be cool to get some feedback from the JavaScript community to get motivation to continue working on it. Let us know in the project's issues or as comments to this post.

## Links and References

Project: [https://github.com/vigneshshanmugam/js-cpa](https://github.com/vigneshshanmugam/js-cpa)

Hash Consing: [https://en.wikipedia.org/wiki/Hash_consing](https://en.wikipedia.org/wiki/Hash_consing)

AST (Abstract Syntax Tree): [https://en.wikipedia.org/wiki/Abstract_syntax_tree](https://en.wikipedia.org/wiki/Abstract_syntax_tree)

DFS (Depth First Search): [https://en.wikipedia.org/wiki/Depth-first_search](https://en.wikipedia.org/wiki/Depth-first_search)

Babel Tools:

- [https://github.com/babel/babel/tree/master/packages/babel-parser](https://github.com/babel/babel/tree/master/packages/babel-parser)
- [https://github.com/babel/babel/tree/master/packages/babel-types](https://github.com/babel/babel/tree/master/packages/babel-types)
- [https://github.com/babel/babel/tree/master/packages/babel-traverse](https://github.com/babel/babel/tree/master/packages/babel-traverse)

Longest Common Subsequence: [https://en.wikipedia.org/wiki/Longest_common_subsequence_problem](https://en.wikipedia.org/wiki/Longest_common_subsequence_problem)
