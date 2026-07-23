export function createLogger(nodeEnv) {
  const detailed = nodeEnv === "development";
  return {
    info(message, details) {
      if (detailed) console.info(message, details || "");
    },
    error(message, error) {
      if (detailed) console.error(message, error);
    }
  };
}
