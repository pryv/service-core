const request = require('superagent');

/**
* Helper function that modularizes the sending of an email,
* should it be via Mandrill or via Pryv service-mail
* @param emailSettings: email settings object
* @param template: email template (welcome or reset password)
* @param recipient: email recipient (to)
* @param subs: object containing the variables to be substituted in the email
* @param lang: user prefered language
* @param callback(err,res): called once the email is sent
*/
exports.sendmail = function (emailSettings, template, recipient, subs, lang, callback) {
  const mailingMethod = emailSettings.method;
  
  let sendMailData, sendMailURL;
  
  // Sending via Pryv service-mail
  if (mailingMethod === 'microservice') {
    sendMailURL = [emailSettings.url, template, lang].join('/');
    
    sendMailData = {
      key: emailSettings.key,
      to: recipient,
      substitutions: subs
    };
  }
  // Sending via Mandrill
  else if (mailingMethod === 'mandrill') {
    
    sendMailURL = emailSettings.url;
    
    const subsArray = [];
    for (const [key, value] of Object.entries(subs)) {
      subsArray.push({
        name: key,
        content: value
      });
    }
    
    sendMailData = {
      key: emailSettings.key,
      template_name: template,
      template_content: [],
      message: {
        to: [recipient],
        global_merge_vars: subsArray,
        tags: [template]
      }
    };
  }
  // Invalid email method
  else {
    return callback(new Error('Missing or invalid email method.'));
  }
  
  request.post(sendMailURL).send(sendMailData).end(callback);
};