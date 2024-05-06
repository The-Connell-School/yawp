#!/usr/bin/env node

import { writeFile } from 'node:fs/promises'
import { $ } from 'execa'

// eslint-disable-next-line no-console
console.log('setting up swapfile...')
await $`fallocate -l 512M /swapfile`
await $`chmod 0600 /swapfile`
await $`mkswap /swapfile`
await writeFile('/proc/sys/vm/swappiness', '10')
await $`swapon /swapfile`
await writeFile('/proc/sys/vm/overcommit_memory', '1')
// eslint-disable-next-line no-console
console.log('swapfile setup complete')
