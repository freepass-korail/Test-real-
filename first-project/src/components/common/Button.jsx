import styled, { css } from 'styled-components';
import { buttonVariants, layout, typography } from '../../styles/theme';

const variantStyles = {
  primary: css`
    background-color: ${buttonVariants.primary.background};
    color: ${buttonVariants.primary.color};

    &:active {
      background-color: ${buttonVariants.primary.activeBackground};
    }
  `,
  secondary: css`
    background-color: ${buttonVariants.secondary.background};
    color: ${buttonVariants.secondary.color};

    &:active {
      background-color: ${buttonVariants.secondary.activeBackground};
    }
  `,
  outline: css`
    background-color: ${buttonVariants.outline.background};
    color: ${buttonVariants.outline.color};
    border: ${buttonVariants.outline.border};

    &:active {
      background-color: ${buttonVariants.outline.activeBackground};
    }
  `,
  ghost: css`
    background-color: ${buttonVariants.ghost.background};
    color: ${buttonVariants.ghost.color};

    &:active {
      background-color: ${buttonVariants.ghost.activeBackground};
    }
  `,
};

const StyledButton = styled.button`
  width: ${({ $fullWidth }) => ($fullWidth ? '100%' : 'auto')};
  min-height: ${layout.buttonHeight};
  padding: 16px 24px;
  border: none;
  border-radius: ${layout.buttonRadius};
  font-family: ${typography.fontFamily};
  font-size: ${typography.buttonSize};
  font-weight: 600;
  line-height: ${typography.lineHeight};
  cursor: pointer;
  transition: background-color 0.15s ease;
  flex: ${({ $flex }) => ($flex ? 1 : 'none')};

  ${({ $variant }) => variantStyles[$variant] || variantStyles.primary}

  ${({ $dimmed }) =>
    $dimmed &&
    css`
      background-color: #9BB8F5;
      color: rgba(255, 255, 255, 0.85);
      cursor: default;
      pointer-events: none;
    `}

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
`;

function Button({
  children,
  variant = 'primary',
  fullWidth = false,
  flex = false,
  dimmed = false,
  ...props
}) {
  return (
    <StyledButton
      $variant={variant}
      $fullWidth={fullWidth}
      $flex={flex}
      $dimmed={dimmed}
      {...props}
    >
      {children}
    </StyledButton>
  );
}

export default Button;
