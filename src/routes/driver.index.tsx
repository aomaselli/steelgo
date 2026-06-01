import { createFileRoute } from "@tanstack/react-router";
import DriverHomePage from "@/pages/driver/DriverHomePage";

export const Route = createFileRoute("/driver/")({ component: DriverHomePage });
