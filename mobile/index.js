import { AppRegistry } from 'react-native';
import App from './src/App';
import appJson from './app.json';

AppRegistry.registerComponent(appJson.name, () => App);
