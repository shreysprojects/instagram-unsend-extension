# Instagram — Delete All My Messages

A Chrome extension that unsends your messages throughout the open Instagram
conversation. Version 1.3.2 has one start button and a Stop button.

## Install

1. Open `chrome://extensions` in Chrome.
2. Enable **Developer mode**.
3. Click **Load unpacked** and select `C:\Users\shrey\instagram-unsend-extension`.

## Use

1. Open the Instagram conversation you want to clean out.
2. Click **Delete all my messages** and confirm the permanent deletion warning.
3. Keep the tab open and visible while the extension works.
4. Click **Stop** to cancel. Switching conversations also cancels the run.

There is no preliminary scan. The extension starts at the newest messages,
deletes your messages in that loaded batch, scrolls up, and repeats. It waits for
older history to load and preserves its position when Instagram inserts another
batch. The panel reports the current batch and total messages unsent.

Instagram's message menus are still operated individually. The extension waits
for each message to disappear, then paces the next action while the page settles.
Other participants' messages remain. No conversation contents are saved.

Unsending removes your messages for both people and cannot be undone. An action
already sent to Instagram may complete even if you press Stop immediately after.

## Update

After the extension files change, click its **Reload** arrow on
`chrome://extensions`, then refresh Instagram. The panel should show **v1.3.2**.

## If it stops

The Instagram interface must be in English. The extension waits for menus that
initially show Loading. If Unsend never appears, it stops and reports the available
menu actions instead of silently skipping that message. Loading failures and
unconfirmed removals also stop with an error.

Reaching the oldest available boundary means Instagram stopped providing more
history at that time; it is not a server-side guarantee that all historical
messages were returned. If Instagram withheld history, retry later.

Menu opening retries up to three times, reacquiring the same message after scrolling
and rerenders. Only opening the menu is retried; an unconfirmed deletion stops
the run. Successfully unsent messages remain removed if a later action fails.

Confirmation is matched by the Unsend message? heading and Cancel action,
then checked against the topmost visible control. Retained options menus are
never treated as confirmation. The confirmation is clicked once; failures stop.
