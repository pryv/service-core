// @flow

const request = require('superagent');
const errors = require('../../../../errors').factory;
const util = require('util');
const URL = require('url');

type Callback = (error: ?Error, res: ?Object) => any;

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
exports.sendmail = function (emailSettings: EmailSettings, template: string,
  recipient: Recipient, subs: Substitutions, lang: string, callback: Callback): void {
    
  const mailingMethod = emailSettings.method;
  
  // Sending via Pryv service-mail
  
  switch (mailingMethod) {
    case 'microservice': {
      const url = URL.resolve(emailSettings.url, template + '/' + lang);
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
      for (const key of Object.keys(subs)) {
        subsArray.push({
          name: key,
          content: subs[key]
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
      callback(errors.unexpectedError('Missing or invalid email method.'));
    }
  }
  // NOT REACHED
};

function _sendmail(url: string, data: MandrillData | MicroserviceData, cb: Callback): void {
  request.post(url).send(data).end((err, res) => {
    
    // Error handling
    // 1.   Superagent failed
    if (err) {
      const subError = err.message;
      err.message = `Sending email failed while trying to reach mail-service at: ${url}.\n`;
      
      //  1.1 Because of SSL certificates
      if (subError.match(/certificate/i)) {
        err.message += 'Trying to do SSL but certificates are invalid. ';
      }
      //  1.2 Because of unreachable url
      else if (subError.match(/not found/i)) {
        err.message += 'Endpoint seems unreachable. ';
      }
      
      err.message += `Superagent answered with: ${subError}`;
      err = errors.unexpectedError(err);
    }
    // 2. Mail service failed
    else if (!res.ok) {
      const body = util.inspect(res.body);
      const errorMsg = `Sending email failed, mail-service answered with the following error: ${body}.`;
      
      err = errors.unexpectedError(errorMsg + util.inspect(res.body));
    }
    
    cb(err, res);
  });
}
