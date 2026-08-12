export const getBreakdownTotal = (breakdown = [], isPayroll = false) => {
  if (isPayroll) {
    return breakdown.reduce((sum, item) => {
      const hon = Number(item.honoraria) || 0;
      const cbc = Number(item.cbcLbf) || 0;
      return sum + (hon - cbc);
    }, 0);
  }
  
  return breakdown.reduce((sum, item) => {
    const qty = Number(item.quantity) || 0;
    const unit = Number(item.unitCost) || 0;
    return sum + (qty * unit);
  }, 0);
};
