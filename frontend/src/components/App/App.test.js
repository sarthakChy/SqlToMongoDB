import { render, screen } from '@testing-library/react';
import App from './App';

test('renders the app shell', () => {
  render(<App />);
  expect(screen.getByRole('heading', { name: /sql query optimizer/i })).toBeInTheDocument();
  expect(screen.getByText(/input an sql query to compare various execution plans/i)).toBeInTheDocument();
});
