// Imported for its side effect: registers the SIGTERM/SIGINT handlers when the server starts.
import { installShutdownHandlers } from './state';

installShutdownHandlers();
