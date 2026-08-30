---
title: A docking manager is the wrong thing to squeeze into 390 pixels
date: 2026-08-29
feature: specs/112-mobile-support
description: >-
  The harness was never unusable on a phone so much as untested on one — but one of its
  failures was different in kind from the rest. It told a viewer to widen a window that
  had no width to give.
---

# A docking manager is the wrong thing to squeeze into 390 pixels

## The background

Seven views you drag around like windows on a desk is the point of the arrangement,
until somebody opens it on a phone. There is no room for
two panels, a finger crossing the screen is a scroll rather than a drag, and seven tabs
sit on a row that does not scroll. Making the layout smaller does not work: 390 pixels
divided between two panels is two useless panels, not a smaller version of the thing.

## The requirement

The seven views keeping their tabs, order, names and addresses at a phone's size, with
everything a desktop viewer can reach still reachable — one gesture further away rather
than gone.

## The options considered

A separate mobile build was rejected for a reason particular to this project: every pull
request links an instance opened at the change, and two builds means two addresses. What was built is two presentations of one application, chosen from the size
it measures of itself, so a panel docked narrow on a large screen behaves exactly as it
does on a phone.

Two things came from running it. The first draft chose on width alone, and the check
reported the docking layout at 844 by 390 — a phone turned sideways. The second is
worse: the check meant to catch layouts that push the page sideways measured the page,
and every panel clips its contents, so an over-wide table planted in one passed clean.
What replaced it measures every element against the short list of containers allowed to
scroll sideways, and failed at once on two faults nobody had noticed.

## The demo

[Open the framed shell at the map](../../instances/main/mobile.html#/view/map). The size
is mocked; nothing else is.
