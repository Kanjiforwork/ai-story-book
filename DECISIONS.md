# Engineering Decisions

Here are six decisions I made while building the app. Some came from pushing back on AI, and some came from AI catching things I had missed.

## 1. Use SQLite instead of JSON files

- **AI suggested:** Keep the local app simple by saving everything in JSON files.
- **I chose:** Use SQLite for projects, steps, attempts, and image status. The book text and generated images still stay as normal files.
- **Why:** Two tabs can try to update the same project at the same time. SQLite makes those updates much safer and easier to test.
- **Downside:** The app has a small database and a schema to maintain.

## 2. Track steps, attempts, and images separately

- **AI suggested:** Give each pipeline step one status and use that for everything.
- **I changed it:** Track the step, each attempt, and each image separately. The server also leaves a heartbeat while Gemini is working.
- **Why:** If one portrait fails, the portrait that already finished should not disappear. The heartbeat also lets the app notice when a run has stopped responding.
- **Downside:** There is more state to save and more cases to test.

## 3. Keep attempt history tied to the right project

- **AI suggested:** Show one universal attempt history inside every project page.
- **I changed it:** Each project page only shows attempts from that project. I also added a separate `Attempts` tab for the full history across all projects, with links back to each project.
- **Why:** Mixing every attempt into the current project was confusing. Users should immediately know which book an attempt belongs to.
- **Downside:** The app now has two history views to maintain, but each one has a clear purpose.

## 4. Keep the workspace focused on the artwork

- **AI suggested:** Add a large status panel with elapsed time, an item count, and a progress bar.
- **I changed it:** Put one clear action in the header and show loading directly where each image will appear.
- **Why:** The extra status panel made the page feel busy. The artwork and the next action are the things users care about most.
- **Downside:** There is no timer or overall progress bar on the page.

## 5. Do not keep private images in the browser cache

- **My first approach:** Let the browser keep generated images for a year so they would load faster.
- **AI caught:** Even though the images were marked private, the browser could still reuse its saved copy after logout or an ownership change.
- **I changed it:** The browser must ask the server for the image each time, so the server can check ownership again.
- **Downside:** Images may be downloaded again, but that is a reasonable trade-off for this small local app.

## 6. Respect reduced-motion settings

- **My first approach:** Use a spinning circle whenever an image is generating.
- **AI caught:** The circle kept spinning even when a user had asked their device to reduce motion.
- **I changed it:** Stop the animation for those users, while keeping the loading message visible.
- **Downside:** They get less visual movement, but they can still clearly see that the app is working.

## If I had one more day

I would add:

- A short tutorial that explains the five steps to non-technical users.
- A few subtle, reduced-motion-friendly animations so step changes and new results feel more alive.
