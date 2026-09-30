import { configure } from '@testing-library/react';

// Os testes de interface rodam em paralelo com animações por temporizador: dá folga às esperas.
configure({ asyncUtilTimeout: 4000 });
