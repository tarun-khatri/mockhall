import { Navigate, useParams } from 'react-router';

/** /t/<encoded> → the instructions screen for the identical paper. */
export default function SharedTest() {
  const { encoded = '' } = useParams();
  return <Navigate to={`/start?c=${encoded}`} replace />;
}
