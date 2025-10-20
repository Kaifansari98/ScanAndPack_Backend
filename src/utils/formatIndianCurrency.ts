export const formatIndianCurrency = (amount: number | string): string => {
    if (amount === null || amount === undefined || amount === "") return "0";
  
    const num = Number(amount);
    if (isNaN(num)) return "0";
  
    // ✅ Indian comma formatting (2,00,000, 25,50,000 etc.)
    return num.toLocaleString("en-IN");
  };  