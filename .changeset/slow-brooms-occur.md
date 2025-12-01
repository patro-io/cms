---
"@patro-io/cms": patch
"@patro-io/create-cms": patch
---

Fixed 500 error on /admin/profile by using correct Hono middleware patterns ('/admin/profile' + '/admin/profile/_' instead of '/admin/profile_')
