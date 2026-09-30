export const validationResponse = (status: number | boolean, message: string,data:any = []) => {
  return {
    status,
    message,
    data,
  };
};