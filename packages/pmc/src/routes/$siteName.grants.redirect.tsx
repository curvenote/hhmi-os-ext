import { redirect } from 'react-router';

/**
 * Redirect legacy /grants URL to /funding.
 */
export async function loader() {
  throw redirect('/app/sites/pmc/funding');
}

export async function action() {
  throw redirect('/app/sites/pmc/funding');
}
