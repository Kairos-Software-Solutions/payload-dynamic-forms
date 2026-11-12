import type { CollectionConfig } from 'payload'

import type { CollectionOverride } from '../types.js'

/**
 * Applies an override in the official form builder's style: any collection property replaces the
 * default (access, admin and upload are merged key by key) and `fields` receives `{ defaultFields }`.
 */
export function applyOverrides(base: CollectionConfig, override: CollectionOverride | undefined): CollectionConfig {
  if (!override) {
    return base
  }
  const { fields, ...rest } = override
  const merged: CollectionConfig = { ...base, ...rest }
  if (rest.access) {
    merged.access = { ...base.access, ...rest.access }
  }
  if (rest.admin) {
    merged.admin = { ...base.admin, ...rest.admin }
  }
  if (rest.hooks) {
    merged.hooks = { ...base.hooks, ...rest.hooks }
  }
  if (rest.upload && typeof rest.upload === 'object' && base.upload && typeof base.upload === 'object') {
    merged.upload = { ...base.upload, ...rest.upload }
  }
  if (rest.endpoints && base.endpoints) {
    merged.endpoints = [...base.endpoints, ...rest.endpoints]
  }
  merged.fields = fields ? fields({ defaultFields: base.fields }) : base.fields
  return merged
}
