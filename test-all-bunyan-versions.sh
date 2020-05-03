#!/usr/bin/env sh

for v in $(npm view bunyan --json | fx 'this.versions.filter(it => parseInt(it.match(/^(\d+)\.\d+\.\d+$/)[1]) >= 1).join(" ")'); do
  echo testing bunyaner@$v
  npm install bunyan@$v
  npm t
done
