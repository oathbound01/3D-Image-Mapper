import basicSsl from '@vitejs/plugin-basic-ssl';

export default {
    plugins: [basicSsl()],
    server: { https: true },
    publicDir: 'public',
}