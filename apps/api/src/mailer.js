// Email delivery adapter. Without a configured provider, non-production logs messages so flows can be tested locally;
// production refuses to pretend an email was sent.
export function createMailer({production,logger}){
 return {
  configured:!production,
  async send({to,subject,text}){
   if(production)throw Object.assign(new Error('Email delivery is not configured'),{status:503});
   logger?.warn({to,subject,text},'DEV MAILER: email not sent, logged instead');
   return {delivered:false,logged:true};
  },
 };
}
