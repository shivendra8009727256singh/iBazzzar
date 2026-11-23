// Registration fixtures shared by the API tests. Every call gets a fresh, valid Indian mobile number.
let counter=0;
const nextPhone=()=>`9${String(100000000+(++counter)).slice(-9)}`;
const address={line1:'12 Commerce Street',city:'Pune',state:'Maharashtra',pincode:'411001'};
export const customer=(extra={})=>({accountType:'customer',phone:nextPhone(),acceptTerms:true,...extra});
export const businessProfile=(extra={})=>({legalName:'Test Traders Private Limited',businessType:'PRIVATE_LIMITED',gstRegistered:false,contactPhone:nextPhone(),address,...extra});
export const sellerProfile=(extra={})=>({storeName:'Test Store',description:'Independent test seller with handmade goods.',legalName:'Test Store',businessType:'PROPRIETORSHIP',gstRegistered:false,primaryCategory:'Home & Living',contactPhone:nextPhone(),pickupAddress:address,acceptSellerTerms:true,...extra});
