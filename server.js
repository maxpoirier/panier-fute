import express from 'express';

// Local preview of the same static site that GitHub Pages serves. Only this computer can reach it unless HOST says
// otherwise, e.g. HOST=0.0.0.0 to try it from a phone on the same Wi-Fi.
const port = Number(process.env.PORT ?? 3000);
const host = process.env.HOST ?? 'localhost';

express()
  .use(express.static(new URL('./public', import.meta.url).pathname))
  .listen(port, host, () => console.log(`Le panier futé de Max : http://localhost:${port}`));
