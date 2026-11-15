# AI use log: Ridgelight

Team Tech Arena, NASA Space Apps Challenge 2026. AI tool used: Claude Code (Anthropic), run as several AI agents. Each agent had a job: research, writing code, testing, reviewing, or writing documents. A person on the team set the direction, made the decisions and approved every deployment.

The idea was the team's: a planning tool that compares landing sites and dates against real terrain. AI did not choose it.

## How the AI was set up
- **One coordinating agent** split the work into small features and gave each one to a specialist agent: research, astronomy and terrain code, interface code, tests, or documents. Several agents worked at the same time on separate files.
- **Separate reviewer agents** checked every feature before it was merged: one for the code and the science, one for design and accessibility. The builder then fixed what they found.
- **Automatic gate:** a feature merged only when the typecheck, all tests and the build passed.
- **Human control:** a guard script stopped the AI from updating the live site, force-pushing over published history or making the code public. Only the team member could do those things, and they also approved every file download and every new tool.

## Before the event
- **Research:** AI read the challenge page and rules and collected landing-site coordinates and options for the data. It gave a source link for every fact, and the team reviewed the findings.
- **Planning:** AI drafted the build plan, task list and screen design from the team's chosen idea and tools.
- **Technical recommendations:** an AI reviewer suggested the method details: when the Sun counts as giving power, when Earth counts as in view, how the horizon is computed and how accurate the positions must be. The team accepted them and could change any of them.

## During the event (14 Nov 2026)
- **Code:** AI agents wrote the TypeScript app and the Python terrain step. That step turns NASA LOLA height data into horizon profiles.
- **Tests and checking:** AI wrote the automated tests and compared Sun and Earth positions with JPL Horizons at 162 points: the largest difference was 0.0063°. It also checked rise and set times against Horizons, and the share of time in sunlight against a published NASA study (Gläser et al. 2018). A separate AI reviewer recomputed the terrain horizons independently, and they agreed within 0.001°.
- **Review:** every feature was reviewed by a separate AI code reviewer, and every screen by a design and accessibility reviewer, before it was merged. Nothing merged unless the typecheck, tests and build passed.
- **Design:** AI made screen mockups, and the team chose the visual direction over several rounds of changes.
- **Features the team asked for:** compare, playback, the events list, triggers, the landing-window finder, ranking the terrain sites for a date range, and the zoom out to the whole Moon, Earth and Sun. AI built and tested each one.
- **Hosting:** AI set up the Vercel deployment in the team's browser, with the team's approval. The team approved every update to the live site.
- **Documents:** AI drafted the README, the project description and the video script, and the team edited and approved them.
- **Demo video:** AI recorded the screen of the real, live app and added text captions. The voiceover is a team member's own.

## What AI did not do
- Pick the challenge idea or the solution approach.
- Make any images or video with generative AI. The Moon and Earth images are NASA's (SVS CGI Moon Kit and Blue Marble), with credit.
- Use or change NASA logos or branding.
