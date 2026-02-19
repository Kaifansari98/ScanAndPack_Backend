export const validationResponse = (status: number | boolean, message: string) => {
  return {
    status,
    message,
  };
};