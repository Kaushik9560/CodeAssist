import { Router } from "express";

export function createHealthRouter() {
  const router = Router();
  router.get("/", (_request, response) => {
    response.json({ status: "ok", service: "codeassist", version: "5.0.0" });
  });
  return router;
}
