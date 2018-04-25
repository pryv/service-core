// @flow

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

type Callback = (error: Error | null, res: Object | null) => any;

type Recipient = {
  email: string,
  name: string,
  type: ?string
};

type EmailSettings = {
  method: EmailMethod,
  url: string,
  key: string,
  welcomeTemplate: string,
  resetPasswordTemplate: string
};

type EmailMethod = 'mandrill' | 'microservice';

type MandrillData = {
  key: string,
  template_name: string,
  template_content: Array<string>,
  message: MandrillMessage
};

type MandrillMessage = {
  to: Recipient[],
  global_merge_vars: Array<MandrillSubstitution>,
  tags: Array<string>
}

type MandrillSubstitution = {
  name: string,
  content: string
};

type MicroserviceData = {
  key: string,
  to: Recipient,
  substitutions: Substitutions
};

type Substitutions = {[string]: string};

exports.sendmail = function (emailSettings: EmailSettings, template: string, recipient: Recipient, subs: Substitutions, lang: string, callback: Callback): void {
  const mailingMethod = emailSettings.method;
  
  // Sending via Pryv service-mail
  
  switch (mailingMethod) {
    case 'microservice': {
      const url = [emailSettings.url, template, lang].join('/');
      const data = {
        key: emailSettings.key,
        to: recipient,
        substitutions: subs
      };
      
      _sendmail(url, data, callback);
      
    } break;
    
    case 'mandrill': {
      const url = emailSettings.url;
      
      const subsArray = [];
      for (const [key, value] of Object.entries(subs)) {
        subsArray.push({
          name: key,
          content: value
        });
      }
      
      const data = {
        key: emailSettings.key,
        template_name: template,
        template_content: [],
        message: {
          to: [recipient],
          global_merge_vars: subsArray,
          tags: [template]
        }
      };
      
      _sendmail(url, data, callback);
      
    } break;
    
    default: {
      callback(new Error('Missing or invalid email method.'));
    }
  }
}

function _sendmail(url: string, data: MandrillData | MicroserviceData, cb: Callback): void {
  request.post(url).send(data).end(cb);
}

