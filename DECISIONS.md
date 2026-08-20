# Engineering Decisions

These are six decisions I actually made while building the app. In the first four, I pushed back on Codex. In the last two, Codex caught things I had missed.

I tested the real flow with `gemini-3.6-flash` for text and `gemini-3.1-flash-image` for images. Both stay configurable through environment variables because model IDs can change.

## 1. SQLite instead of JSON

Codex suggested JSON because this is a small local app. I did not think it was enough. Two tabs can update the same project, and I need to lock a step before calling Gemini. I used SQLite for the app state and kept the book text and images as normal files. The claim is saved before the Gemini call, so a refresh or second tab sees the running step instead of starting another call. It adds a schema and one dependency, but the state is much safer to update.

## 2. More than one status

Codex suggested one status for each step. That gets confusing when one portrait is done, another fails, and the user is already on attempt two. I separated step progress, attempt history, and each image's status. I also added a heartbeat so the app can recover a run that stops responding. It means more fields and tests, but partial results no longer get lost.

## 3. Two kinds of attempt history

Codex first showed every attempt inside every project page. It was hard to tell which attempt belonged to which book. I changed the project page to show only that project's attempts, then added a separate `Attempts` tab for everything. The global list links back to the right project. There are now two small views to maintain, but both make sense at a glance.

## 4. Less status UI, more artwork

Codex suggested a big status card with a timer, item count, and progress bar. It took up too much space and made the page feel generic. I moved the main action to the header and show loading inside the image that is being generated. The page is much cleaner, although there is no overall timer or progress bar anymore.

## 5. Do not cache private images for a year

I originally cached generated images for a year so they would load faster. Codex pointed out that the same browser could still show a cached image after logout or an ownership change. I switched the response to `private, no-store`, so the server checks access again whenever the image is opened. The image may download again, but that is fine for a local app.

## 6. Respect reduced motion

My loading circle always spun. Codex caught that it still moved when the user had reduced motion turned on. I fixed the CSS so the circle stays still for those users, while the loading text stays visible. It is less animated, but it still says what the app is doing.

## If I had one more day

I would add a short tutorial for non-technical users and a few subtle animations. The tutorial would make the five steps easier to follow, and the animations would make the site feel more alive without adding more features.
