"""Packaging security/metadata tests; fixtures are not Russian models or license evidence."""
import importlib.util
import json
from pathlib import Path
import tempfile
import unittest
import zipfile

spec = importlib.util.spec_from_file_location("prepare_sol", Path(__file__).parents[1] / "scripts/prepare_sol.py")
pack = importlib.util.module_from_spec(spec)
spec.loader.exec_module(pack)

class PackagingTests(unittest.TestCase):
    def test_exact_model_license_row_required(self):
        sample = '<tr><td><a href="https://alphacephei.com/vosk/models/vosk-model-small-ru-0.22.zip">ru</a></td><td>Apache 2.0</td></tr>'
        self.assertIn('Apache 2.0', pack.model_license(sample))
        for bad in [sample.replace('0.22.zip', '0.22-lgraph.zip'), sample.replace('Apache 2.0', 'Unknown'), '<tr>Apache 2.0</tr>']:
            with self.assertRaises(ValueError):
                pack.model_license(bad)

    def test_pins_and_runtime_upload_agree(self):
        self.assertEqual(pack.RUNTIME['minBytes'], 14882445)
        self.assertEqual(pack.MODEL['sha256'], '961d5ff98a17f4aa6de69864d0aa71fa5bac682301d2b5d17a3f24c5c99a46d4')
        config = json.loads((pack.ROOT / 'src-tauri/tauri.bundle.conf.json').read_text())
        self.assertEqual(config['bundle']['resources'], {'resources/sol/': 'sol/'})
        self.assertEqual(config['bundle']['windows']['nsis']['installMode'], 'currentUser')
        self.assertEqual(config['bundle']['windows']['webviewInstallMode']['type'], 'offlineInstaller')

    def test_size_hash_and_traversal_fail_closed(self):
        with tempfile.TemporaryDirectory() as temp:
            temp = Path(temp)
            path = temp / 'model(1).zip'
            with zipfile.ZipFile(path, 'w') as archive:
                archive.writestr('vosk-model-small-ru-0.22/../../escape', b'bad')
            with self.assertRaises(ValueError):
                pack.check_archive(path, pack.MODEL)
            with self.assertRaises(ValueError):
                pack.extract(path, pack.MODEL, temp / 'output')
            self.assertFalse((temp / 'escape').exists())

    def test_archive_filename_does_not_change_internal_model_directory(self):
        with tempfile.TemporaryDirectory() as temp:
            temp = Path(temp)
            archive = temp / 'vosk-model-small-ru-0.22(1).zip'
            with zipfile.ZipFile(archive, 'w') as out:
                out.writestr('vosk-model-small-ru-0.22/conf/model.conf', b'fixture only')
            pack.extract(archive, pack.MODEL, temp / 'model')
            self.assertEqual((temp / 'model/conf/model.conf').read_bytes(), b'fixture only')

if __name__ == '__main__':
    unittest.main()
