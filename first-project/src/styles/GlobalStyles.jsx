import { createGlobalStyle } from 'styled-components';
import { colors, layout, typography } from './theme';

const GlobalStyle = createGlobalStyle`
  *, *::before, *::after {
    box-sizing: border-box;
    margin: 0;
    padding: 0;
  }

  :root {
    --color-korail-main: ${colors.primary};
    --color-korail-dark: ${colors.dark};
    --color-korail-gray: ${colors.gray};
    --color-korail-black: ${colors.black};
    --color-korail-bg: ${colors.bg};
    --mobile-width: ${layout.mobileWidth};
    --mobile-height: ${layout.mobileHeight};
  }

  html, body, #root {
    height: 100%;
    overflow: hidden;
  }

  body {
    min-height: 100dvh;
    font-family: ${typography.fontFamily};
    background-color: var(--color-korail-bg);
    color: var(--color-korail-black);
    font-size: ${typography.bodySize};
    line-height: ${typography.lineHeight};
    -webkit-font-smoothing: antialiased;
    -moz-osx-font-smoothing: grayscale;
  }

  button {
    font-family: inherit;
    cursor: pointer;
  }
`;

export default GlobalStyle;
