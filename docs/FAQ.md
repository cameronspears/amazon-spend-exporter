# FAQ

## Does this use an official Amazon API?
No. It uses user-driven browser automation against Amazon's order pages.

## Does this bypass CAPTCHA or checkpoints?
No. The run pauses and waits for manual user action.

## Does it support marketplaces outside amazon.com?
Not in v0.1.0.

## Why do I sometimes see warnings?
Amazon order/detail page variants can differ by order type and age. Warnings provide diagnostics and partial-run transparency.

## Can I run this headless?
Yes (`headless: true`), but headed mode is recommended for manual auth/checkpoint handling.

## Are digital orders included?
No. v0.1.0 targets physical retail orders.
