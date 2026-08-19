# React + Vite

## Google Books setup

Book search, covers, ISBNs, and descriptions use the Google Books API. Enable the
Books API in a Google Cloud project, create an API key, and add it to `.env.local`:

```env
VITE_GOOGLE_BOOKS_API_KEY=your_api_key
```

Restart the Vite development server after changing `.env.local`. For a deployed
site, add the same variable in the hosting provider and rebuild. Because this is
a browser app, restrict the key to the site's HTTP referrers and to the Books API.

This template provides a minimal setup to get React working in Vite with HMR and some ESLint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Oxc](https://oxc.rs)
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/)

## React Compiler

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

## Expanding the ESLint configuration

If you are developing a production application, we recommend using TypeScript with type-aware lint rules enabled. Check out the [TS template](https://github.com/vitejs/vite/tree/main/packages/create-vite/template-react-ts) for information on how to integrate TypeScript and [`typescript-eslint`](https://typescript-eslint.io) in your project.
