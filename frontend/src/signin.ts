import * as auth from './auth';
import { byId } from './dom';

let mode: 'login' | 'register' = 'login';
const password = byId<HTMLInputElement>('password');
const submit = byId<HTMLButtonElement>('auth-submit');
for (const action of ['login', 'register'] as const) {
  byId(`tab-${action}`).onclick = () => {
    mode = action;
    const title = mode === 'login' ? 'Sign in' : 'Create account';
    byId('auth-heading').textContent = submit.textContent = title;
    password.autocomplete = mode === 'login' ? 'current-password' : 'new-password';
    for (const tab of ['login', 'register']) byId(`tab-${tab}`).setAttribute('aria-pressed', String(tab === mode));
    byId('auth-message').textContent = '';
  };
}
byId('show-password').onclick = () => {
  const show = password.type === 'password';
  password.type = show ? 'text' : 'password';
  byId('show-password').textContent = show ? 'Hide password' : 'Show password';
  byId('show-password').setAttribute('aria-pressed', String(show));
};
byId<HTMLFormElement>('auth-form').onsubmit = async (event) => {
  event.preventDefault();
  submit.disabled = true;
  byId<HTMLButtonElement>('tab-login').disabled = true;
  byId<HTMLButtonElement>('tab-register').disabled = true;
  try {
    await auth[mode](byId<HTMLInputElement>('username').value, password.value);
    location.assign(auth.safeNext(new URLSearchParams(location.search).get('next')));
  } catch (error) {
    byId('auth-message').textContent = (error as Error).message;
  } finally {
    submit.disabled = false;
    byId<HTMLButtonElement>('tab-login').disabled = false;
    byId<HTMLButtonElement>('tab-register').disabled = false;
  }
};
