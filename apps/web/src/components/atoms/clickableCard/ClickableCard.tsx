import { Paper, UnstyledButton } from '@mantine/core';
import { Link } from 'react-router-dom';
import type { ReactNode } from 'react';

import styles from './ClickableCard.module.css';

interface ClickableCardProps {
    to: string;
    label: string;
    children: ReactNode;
}

export function ClickableCard({ to, label, children }: ClickableCardProps) {
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
                aria-label={label}
            />

            <div className={styles.content}>
                {children}
            </div>
        </Paper>
    );
}