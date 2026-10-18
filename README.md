# The Collector - measured, not computed

**Live demo:** [https://the-collector-ivory.vercel.app](https://the-collector-ivory.vercel.app)

Interactive 3D site for atomQUEST 2026, Round 1, Track 2 (water purifier). It shows a purifier concept that adds per-cartridge pressure drop, normalised by flow, to the sensing Atomberg's Intellon already has, so a clogged, removed or bypassed cartridge shows up in the data.

This is a concept. All values on the page are simulated, not measured.

## Run

    npm install
    npm run dev      # local dev server
    npm run build    # static output in dist/

Plain Vite project, no framework. three.js is vendored in `src/vendor`.

## Layout

- `src/markup.js` page content
- `src/rig.js` three.js scene, controls and labels
- `src/style.css` styles
