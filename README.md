# Instagram — Unsend All My Messages

A Chrome extension that adds a small "Unsend all" panel to Instagram DMs.
Open a conversation, press **Unsend my messages**, and it will unsend every
message you sent in that chat, one by one — the same way you would by hand
(hover → ⋯ → Unsend → confirm), just automated.

## How to install (one time)

1. Open Chrome and go to `chrome://extensions`
2. Turn ON **Developer mode** (toggle in the top-right corner)
3. Click **Load unpacked** (top-left)
4. Pick this folder: `C:\Users\shrey\instagram-unsend-extension`
5. Done — you don't need to pin anything to the toolbar

## How to use

1. Go to instagram.com and open the conversation you want to clean out
2. A small white panel appears in the bottom-right corner of the page
3. Click **Unsend my messages** and confirm the warning
4. Leave the tab open and visible while it works — it shows a running count
5. Click **Stop** any time to pause; navigating away also stops it

It automatically scrolls up to load older messages and keeps going until
there is nothing left of yours to unsend.

## Good to know

- **Unsending is permanent** and removes the message for BOTH people.
  There is no undo.
- It goes at roughly one message every 1.5–2 seconds on purpose. Going
  faster can make Instagram temporarily block actions on your account.
  For a very long conversation, expect it to take a while.
- Your Instagram language must be set to **English** (it looks for the
  word "Unsend" on screen).
- Instagram changes its website now and then. If the button one day does
  nothing, the extension likely needs a small update to match the new page.
- Automating actions like this is technically against Instagram's terms
  of service — use it on your own account, at your own pace.
