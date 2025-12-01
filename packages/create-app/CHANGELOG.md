# @patro-io/create-cms

## 0.1.0-beta.13

### Patch Changes

- - Added polling for AI translation
  - Improved translation UX
  - Shows progress notifications
  - Handles translation timeout

## 0.1.0-beta.12

### Patch Changes

- - Use wrangler d1 execute
  - Remove seed script
  - Use SQL file for execution

## 0.1.0-beta.11

### Patch Changes

- - Improved security
  - Random admin password
  - Added instructions

## 0.1.0-beta.10

### Patch Changes

- - Random password generation
  - Improved security for demo login
  - Updated documentation

## 0.1.0-beta.9

### Patch Changes

- - Removed admin seeding logic
  - Streamlined project setup
  - Simplified initial configuration

## 0.1.0-beta.8

### Patch Changes

- - Removed admin seeding logic
  - Streamlined project setup
  - Simplified initial configuration

## 0.1.0-beta.7

### Patch Changes

- - Corrected relative chunk paths
  - Updated paths after build

## 0.1.0-beta.6

### Patch Changes

- - Fix hardcoded admin credentials in seed script
  - Refactor build output for clarity
  - Add platform dispose() to prevent memory leaks

## 0.1.0-beta.5

### Patch Changes

-

## 0.1.0-beta.4

### Patch Changes

- - Fix activity log translations

## 0.1.0-beta.3

### Patch Changes

- Fixed 500 error on /admin/profile by using correct Hono middleware patterns ('/admin/profile' + '/admin/profile/_' instead of '/admin/profile_')

## 0.1.0-beta.2

### Patch Changes

- feat: Refactor environment variable handling to use Effect.Config for improved type-safety and validation.

## 0.1.0-beta.1

### Minor Changes

- [`c31ea79`](https://github.com/patro-io/cms/commit/c31ea793048c964e22d8138a0dbc67becd237f36) Thanks [@patro-io](https://github.com/patro-io)! - docs: update READMEs with Beta status, Multilingual/AI features, and Pure Effect details
