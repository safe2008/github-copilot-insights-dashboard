/**
 * Centralized Chart.js component registration.
 *
 * Import this module once in any page that uses react-chartjs-2 components.
 * Chart.js is idempotent about re-registration, but having a single source
 * keeps the imports DRY and avoids duplicating the register() call in every page.
 */

import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  ArcElement,
  Filler,
  Tooltip,
  Legend,
  Title,
} from "chart.js";

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  ArcElement,
  Filler,
  Tooltip,
  Legend,
  Title,
);
