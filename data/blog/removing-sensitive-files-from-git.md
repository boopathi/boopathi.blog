---
title: Removing sensitive files from git
date: '2020-03-01'
tags:
  - git
draft: false
summary: >-
  If you've some file committed to a git repository, and you'd like to remove
  it, simply deleting the file and committing it again will not remove the file
  completely. It still lies in the git history. If you want to remove a file
  from git history, the history needs to be re-written. This post is about
  exactly doing that - rewriting git history such that the file to be removed
  stays removed.
images:
  - /static/blog/removing-sensitive-files-from-git/twitter-card.png
---

If you've some file committed to a git repository, and you'd like to remove it, simply deleting the file and committing it again will not remove the file completely. It still lies in the git history. If you want to remove a file from git history, the history needs to be re-written.

## TL;DR

Official git recommendation: https://github.com/newren/git-filter-repo to be used instead of git filter-branch.

```
git filter-repo --force --invert-paths \
  --path PATH-TO-YOUR-FILE-WITH-SENSITIVE-DATA-1 \
  --path PATH-TO-YOUR-FILE-WITH-SENSITIVE-DATA-2
```

## Important Note:

If you're using a public git repository, these changes are not enough. The forks and other local clones can (or) **will not be updated**. You have to **invalidate** the secret by going to the corresponding secret provider and generating a new secret.

## Status quo

If you've often faced this issue, it's highly likely that you ended up in the [GitHub's article of how to remove sensitive files from git](https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/removing-sensitive-data-from-a-repository). The GitHub help page recommends two ways to do this, as of this writing,

1. Using BFG (it never worked for me, so I'm going to skip this)
1. Using git filter-branch. This one works.

Using filter-branch, your command would look like -

```sh
git filter-branch --force --index-filter \
  "git rm --cached --ignore-unmatch PATH-TO-YOUR-FILE-WITH-SENSITIVE-DATA" \
  --prune-empty --tag-name-filter cat -- --all
```

## The Problem

When I used this command today after a long time, `git` started warning me about the usage of this command -

```
WARNING:
  git-filter-branch has a glut of gotchas generating mangled history
  rewrites.  Hit Ctrl-C before proceeding to abort, then use an
  alternative filtering tool such as 'git filter-repo'
  (https://github.com/newren/git-filter-repo/) instead.  See the
  filter-branch manual page for more details; to squelch this warning,
  set FILTER_BRANCH_SQUELCH_WARNING=1.
```

Also, from the https://git-scm.com/ docs,

```
git filter-branch has a plethora of pitfalls that can produce non-obvious manglings of the intended history rewrite (and can leave you with little time to investigate such problems since it has such abysmal performance). These safety and performance issues cannot be backward compatibly fixed and as such, its use is not recommended. Please use an alternative history filtering tool such as [git filter-repo](https://github.com/newren/git-filter-repo/). If you still need to use git filter-branch, please carefully read [SAFETY](https://git-scm.com/docs/git-filter-branch#SAFETY) (and [PERFORMANCE](https://git-scm.com/docs/git-filter-branch#PERFORMANCE)) to learn about the land mines of filter-branch, and then vigilantly avoid as many of the hazards listed there as reasonably possible.
```

## The Solution

As you read in the above recommendations, `git` recommends using the `filter-repo` project.

- https://github.com/newren/git-filter-repo/

Let's look at how to use the filter-repo to remove files from git.

```sh
git filter-repo --force --invert-paths \
  --path PATH-TO-YOUR-FILE-WITH-SENSITIVE-DATA-1 \
  --path PATH-TO-YOUR-FILE-WITH-SENSITIVE-DATA-2
```

For more options, please refer to the [git filter-repo manual](https://htmlpreview.github.io/?https://github.com/newren/git-filter-repo/blob/docs/html/git-filter-repo.html).

## Verifying changes

The above command is destructive and will apply the changes to your git history immediately. To test and inspect the behavior, the following technique helped me inspect the changes -

### Step 1: Run with dry-run

Run the filter-repo command with the CLI flag - `--dry-run`. For example, if `secret.txt` is the sensitive file to remove,

```sh
git filter-repo --force --invert-paths \
  --path secret.txt \
  --dry-run
```

And this will output two files in the `.git` directory of the project, and the output will be something like this -

```
Parsed 132 commits
New history written in 0.05 seconds; now repacking/cleaning...
NOTE: Not running fast-import or cleaning up; --dry-run passed.
      Requested filtering can be seen by comparing:
        .git/filter-repo/fast-export.original
        .git/filter-repo/fast-export.filtered
```

### Step 2: Diff original and filtered

As you see in the above output, the `filter-repo` command creates the snapshots of the commits - before and after applying the `filter-repo`. We can inspect the diff between these two files to inspect the changes that will made.

Tip: To diff, there are many tools - CLI, webapp, etc... Since we are working with git, let's use `git` again to get a pretty diff between those two files. Git `diff` has a flag `--no-index` that allows you to pass files (need not be part of the repo) and diff them using git diff strategies and also presentation - colors and alignments.

```sh
git diff --no-index -- \
  .git/filter-repo/fast-export.original \
  .git/filter-repo/fast-export.filtered
```

## Gotchas

### git remote

The `git filter-repo` works great and there is one gotcha — the remotes are removed after the filter-repo is applied. If you have multiple remotes, you can create a backup of `.git/config` file. Once the filter-repo command completes, you can replace the `.git/config` file.

### push --force

Once you have updated the local commit history, you have push these new changes using the `--force` option.

```sh
git push --force
```

## Conclusion

It's a reminder that, if you're pushing to a public repository these changes are not enough. The forks and other local clones can (or) will not be updated. You have to **invalidate** the secret by going to the corresponding secret provider and generate a new secret.

If you have comments or suggestions, please feel free to tweet to me at [@heisenbugger](https://twitter.com/heisenbugger).
