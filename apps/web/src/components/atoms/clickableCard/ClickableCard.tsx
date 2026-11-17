import { Paper, UnstyledButton } from '@mantine/core';
import { Link } from 'react-router-dom';
import type { ReactNode } from 'react';

import styles from './ClickableCard.module.css';

interface ClickableCardProps {
    to: string;
    children: ReactNode;
}

/**
 * Card clickable
 * @returns 
 */
export function ClickableCard({ to, children }: ClickableCardProps) {
    return (
        <Paper
            withBorder
            radius="md"
            p="md"
            className={styles.card}
        >
            <UnstyledButton
                component={Link}
                to={to}
                className={styles.link}
                aria-label="Ouvrir"
                tabIndex={-1}
            />

            <div className={styles.content}>
                {children}
            </div>
        </Paper>
    );
}