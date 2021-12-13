---
title: Modelling timers for the browser
date: '2019-10-31'
tags:
  - browser
  - timer
draft: false
summary: This post is about how to effectively model timers for the web and go through the shortcomings of each of those models.
---

Timers are one of the primary entities of the web. One of the common forms of timers shown to the user is the Countdown timer. In this post, we shall discuss about how to effectively model it and go through the shortcomings of each of those models.

The TL;DR version of this post is that the simplest way to model timers is to send the Target DateTime with timezone to the browser and let the browser firgure out the rest of the calculations from there - be it remaining seconds or time consumed.

## The problem

The product manager wants to release a new campaign which will go live in a few days and they want to enrich the users experience by adding a countdown to some page. Now, you as the developer should build the countdown and also request the backend team to send required data.

It's intuitive to model this countdown timer with the seconds remaining as the variable and keep ticking to update a container that displays the timer. For example, the following naive example could simply work for most use-cases.

```js
function startCountdown(container, remainingSeconds) {
  function tick() {
    remainingSeconds--
    if (remainingSeconds < 0) {
      clearInterval(interval)
    }
    container.innerHTML = `${remainingSeconds} seconds remaining`
  }
  const interval = setInterval(tick, 1000)
}
```

## remainingSeconds

The easiest way to formulate a solution is to look at our implementation `startCountdown` and look at what it requires. It takes in a container which will be updated every second and the number of seconds remaining which is the initial state. So we ask the backend team to give us the seconds remaining in the API response.

```json
{
  "remainingSeconds": 120
}
```

It doesn't take much time to realise when you are actually testing the countdown by setting a shorter time that this model does not account for the latency between the server (where the remaining seconds is calculated) and the function call `startCountdown` (where it is actually used). It becomes obvious that there are a lot of things happening between these two events that contribute to the latency. Some of them are -

- Latency between API server and your, say, BFF(Backend for Frontend) server.
- Time for HTML to download, parse and trigger other downloads (like script).
- Time for scripts to download.
- Time for scripts to execute and do app initialisations if any.
- Time to initialise and then finally call our function `startCountdown`

So this model obviously does not work for our problem where a user looking at the timer counting down to `0` should not have an error margin which can be a few seconds on mobile devices with slow connection.

## targetTime

TL;DR: This looks like the most pragmatic approach for timers. Use this wherever you want a timer in the browser.

Then we go on to our next solution. Sending the targetTime to the browser.

```json
{
  "targetTime": "2019-10-31T16:20:26+00:00"
}
```

If the users are on different timezones, then it is important that the target timezone is part of this data. Also even if the company runs operations only in one country, it's fair to expect users to use it from other countries and their experience of the timer we are building shouldn't be degraded. So, we are going to have a strong assumption that all webapps/sites we build will be accessed from multiple timezones.

From this target time we calculate the remaining seconds.

```js
function getRemainingSeconds(targetTime) {
  return (new Date(targetTime) - new Date()) / 1000
}
```

The `Date` class in JavaScript reads the timestamp provided in the supplied input and returns a date in the local time. `new Date(targetTime)` will return date object in local time. So, for users in other timezones, it will be their local time. `new Date()` will return the current date object in local time. So subtracting these two dates which both correspond to the local time of the user gives us the correct result of remaining time which we would have measured in the server anyway.

Now, we implement this timer and run a few tests. We change the system's timezone and see that everything works. But, we also test it by changing the system's time (without changing the timezone) and see that our timer is wrong. The user can advance their clock to a few minutes forward and look at what happens after the timer completes before others. This problem is specific to different products and for most cases, we can choose to ignore this and assume that the user in a timezone has their system time correct. We will see how to solve this better in the coming sections.

## JavaScript timers do not ensure any protection

Before we talk about fixing the problem of user's system time, we have to understand that a JavaScript timer running in the users' browser does not ensure any kind of protection. Once the timer data and what happens after the timer completes is shipped to the user, the user can anyway see that. The timer does not protect anything. It merely makes it hard to look at some information. The actual protection need to be enabled from the server by having a disabled link or any other means which is applicable to the product.

## NTP Clock Sync

The problem at hand is that the user's system time is wrong. How do we fix that? There is already an existing solution that's used widely. The way our system clocks sync with the network time / server time suffers the same problems of latency if we just send the current time from the server to the system as sync data. This is where the NTP (Network Time Protocol) Clock Sync algorithm comes into place.

Read more about the Clock Sync algo on wikipedia - https://en.wikipedia.org/wiki/Network_Time_Protocol#Clock_synchronization_algorithm

The Clock Sync algorithm is a simple logic that adds and subtracts different latencies along the round trip to make a perfect sync between the server and the client. We can use this logic to sync users' browser time and use our `targetTime` to make it work.

```json
{
  "targetTime": "2019-10-31T15:20:26+00:00",
  "clockSyncData": {
    // ...
  }
}
```

The other thing to note here is that it might take an extra request to sync the clock for your timer in the browser.

## Moar Problems

So far we have seen solutions on how the initial remaining seconds is calculated and how to fix it under different scenarios. But there are more problems of JavaScript timers running in the browser.

### Event Loop

The timers running in the browser depend on the JavaScript's event loop and for any app that is JavaScript heavy, there is an event loop delay. This makes the timers imprecise. If our product depends on the timer running to this level of accuracy, we have to worry about it.

In the above example, we used `setInterval` for ticking every second. Now, if we add an event loop delay of 100ms, then our tick is called with an error of 100ms. Note: This does not mean that at the end of 10s, our tick will be called at the 11th second. The event loop delays do not aggregate like that. But they do aggregate if the main thread is never free to call the low priority setInterval callback. For critical timers which depend on sub-second granularity, the event loop might be an influencing factor.

### Inactive tab

When the user navigates to another tab, the timers in the background tab get a much higher error rate depending on the browsers, or they might just hang. When the user comes back to our tab, we now have a timer with wrong state.

## NTP Clock Sync Polling

Before we go for this sophisticated solution that will always keep timers in sync, we have to ask ourselves if the product requires such complexities. For most use-cases, the `targetTime` is enough and will work alright.

In this solution, we solve the above two problems - 1. account for event loop delay and 2. account for inactive tab. This solution is the same as the NTP Clock Sync algorithm we discussed above to sync the users' system time initially with an extra polling mechanism to resync on a predefined interval.
